/**
 * Leitura direta de quadros via WebCodecs (`VideoDecoder`).
 *
 * Substitui a captura em tempo real por um `<video>`: os quadros saem na
 * velocidade que a máquina aguenta (tipicamente 4–8x mais rápido) e cada um
 * carrega o carimbo de tempo exato do arquivo, sem risco de dessincronia.
 */
import { demuxMp4, type Mp4Track } from "./mp4demux";

export interface DecodedFrame {
  frame: VideoFrame;
  /** tempo de apresentação em segundos */
  time: number;
  duration: number;
}

/** Lê faixas de bytes do arquivo com buffer rolante (evita milhares de slices). */
class ByteSource {
  private buf: Uint8Array | null = null;
  private start = 0;
  constructor(private file: File) {}

  async read(offset: number, size: number): Promise<Uint8Array> {
    if (this.buf && offset >= this.start && offset + size <= this.start + this.buf.length) {
      return this.buf.subarray(offset - this.start, offset - this.start + size);
    }
    const window = Math.max(size, 8 << 20);
    const end = Math.min(this.file.size, offset + window);
    const ab = await this.file.slice(offset, end).arrayBuffer();
    this.buf = new Uint8Array(ab);
    this.start = offset;
    if (size > this.buf.length) throw new Error("leitura fora do arquivo");
    return this.buf.subarray(0, size);
  }
}

export function videoDecoderSupported() {
  return typeof VideoDecoder !== "undefined" && typeof EncodedVideoChunk !== "undefined";
}

export class FrameReader {
  private decoder: VideoDecoder | null = null;
  private queue: DecodedFrame[] = [];
  private wake: (() => void) | null = null;
  private failed: Error | null = null;
  private next = 0;
  private flushed = false;

  private constructor(
    private track: Mp4Track,
    private bytes: ByteSource,
  ) {}

  static async open(file: File): Promise<FrameReader | null> {
    if (!videoDecoderSupported()) return null;
    const track = await demuxMp4(file);
    if (!track || !track.samples.length) return null;
    try {
      const cfg: VideoDecoderConfig = {
        codec: track.codec,
        ...(track.width ? { codedWidth: track.width } : {}),
        ...(track.height ? { codedHeight: track.height } : {}),
        ...(track.description ? { description: track.description } : {}),
        optimizeForLatency: false,
      };
      const sup = await VideoDecoder.isConfigSupported(cfg);
      if (!sup.supported) return null;
      const reader = new FrameReader(track, new ByteSource(file));
      reader.configure(cfg);
      return reader;
    } catch {
      return null;
    }
  }

  get duration() {
    return this.track.duration;
  }

  private configure(cfg: VideoDecoderConfig) {
    this.decoder = new VideoDecoder({
      output: (frame) => {
        const item: DecodedFrame = {
          frame,
          time: (frame.timestamp ?? 0) / 1e6,
          duration: (frame.duration ?? 0) / 1e6 || 1 / 30,
        };
        // insere já ordenado por tempo de exibição (quadros B podem sair fora)
        let i = this.queue.length;
        while (i > 0 && this.queue[i - 1]!.time > item.time) i--;
        this.queue.splice(i, 0, item);
        this.wake?.();
      },
      error: (e) => {
        this.failed = e as unknown as Error;
        this.wake?.();
      },
    });
    this.decoder.configure(cfg);
  }

  /** Posiciona a leitura no keyframe imediatamente anterior a `time`. */
  async seek(time: number) {
    const samples = this.track.samples;
    // a tabela está em ordem de decodificação: escolhe o último keyframe cujo
    // tempo (dts e cts) já passou, para não pular quadros de referência.
    let idx = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      if (!s.sync) continue;
      if (Math.min(s.cts, s.dts) <= time + 1e-6) idx = i;
      else break;
    }
    if (idx === this.next && this.queue.length) return;
    this.drain();
    try {
      this.decoder?.reset();
      this.decoder?.configure({
        codec: this.track.codec,
        ...(this.track.width ? { codedWidth: this.track.width } : {}),
        ...(this.track.height ? { codedHeight: this.track.height } : {}),
        ...(this.track.description ? { description: this.track.description } : {}),
      });
    } catch {
      /* decoder já configurado */
    }
    this.next = idx;
    this.flushed = false;
  }

  private drain() {
    for (const f of this.queue) f.frame.close();
    this.queue = [];
  }

  private async feed() {
    const dec = this.decoder;
    if (!dec) return;
    while (this.next < this.track.samples.length && dec.decodeQueueSize < 8) {
      const s = this.track.samples[this.next]!;
      const data = await this.bytes.read(s.offset, s.size);
      dec.decode(
        new EncodedVideoChunk({
          type: s.sync ? "key" : "delta",
          timestamp: Math.round(s.cts * 1e6),
          duration: Math.round(s.duration * 1e6),
          data,
        }),
      );
      this.next++;
    }
  }

  /** Próximo quadro em ordem de apresentação (chamador fecha o VideoFrame). */
  async read(): Promise<DecodedFrame | null> {
    for (;;) {
      if (this.failed) throw this.failed;
      // janela de reordenação: espera alguns quadros para garantir ordem de
      // exibição correta em vídeos com quadros B.
      const done = this.next >= this.track.samples.length;
      if (this.queue.length >= 4 || (this.queue.length && (done || this.flushed))) {
        return this.queue.shift()!;
      }
      if (done) {
        if (this.flushed) return null;
        this.flushed = true;
        try {
          await this.decoder?.flush();
        } catch {
          /* nada a esvaziar */
        }
        continue;
      }
      await this.feed();
      await new Promise<void>((res) => {
        const t = setTimeout(res, 40);
        this.wake = () => {
          clearTimeout(t);
          this.wake = null;
          res();
        };
      });
    }
  }

  close() {
    this.drain();
    try {
      this.decoder?.close();
    } catch {
      /* já fechado */
    }
    this.decoder = null;
  }
}
