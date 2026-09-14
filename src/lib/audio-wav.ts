/** Encodes one or two equal-length float channels as interleaved PCM16 WAV. */
export function encodeStereoWav(channels: Float32Array[], sampleRate: number): Blob {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || channels.length < 1 || channels.length > 2 || !channels[0]?.length || channels.some((channel) => channel.length !== channels[0]!.length)) {
    throw new Error("Canais ou taxa de áudio inválidos.");
  }
  const length = channels[0].length;
  const size = length * channels.length * 2;
  const bytes = new ArrayBuffer(44 + size);
  const view = new DataView(bytes);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + size, true);
  writeString(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, size, true);
  let offset = 44;
  for (let index = 0; index < length; index += 1) {
    for (const channel of channels) {
      const raw = channel[index];
      const sample = Math.max(-1, Math.min(1, Number.isFinite(raw) ? raw! : 0));
      view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  return encodeStereoWav([samples], sampleRate);
}
