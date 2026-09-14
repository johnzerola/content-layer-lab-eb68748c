import type { SoundEffectDefinition } from "./library";

const SAMPLE_RATE = 44_100;

/** Creates small, original VaiViral sound effects without downloading third-party audio. */
export function synthesizeSoundEffect(definition: SoundEffectDefinition, serial = Date.now()): File {
  const frameCount = Math.max(1, Math.round(definition.duration * SAMPLE_RATE));
  const samples = new Float32Array(frameCount);
  const random = seededRandom(hash(`${definition.id}:${serial}`));
  let filteredNoise = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / SAMPLE_RATE;
    const progress = frame / Math.max(1, frameCount - 1);
    const noise = random() * 2 - 1;
    let value = 0;
    if (definition.generator === "whoosh") {
      const envelope = Math.sin(Math.PI * progress) ** 1.35;
      filteredNoise += (noise - filteredNoise) * (.025 + progress * .16);
      value = filteredNoise * envelope * .9 + Math.sin(2 * Math.PI * (110 + progress * 280) * time) * envelope * .08;
    } else if (definition.generator === "impact") {
      const envelope = Math.exp(-progress * 7.5);
      const frequency = 82 - progress * 40;
      value = Math.sin(2 * Math.PI * frequency * time) * envelope + noise * Math.exp(-progress * 32) * .7;
    } else if (definition.generator === "pop") {
      const envelope = Math.sin(Math.PI * Math.min(1, progress * 1.25)) * Math.exp(-progress * 2.2);
      value = Math.sin(2 * Math.PI * (260 + progress * 640) * time) * envelope;
    } else if (definition.generator === "click") {
      value = (noise * .6 + Math.sin(2 * Math.PI * 1_900 * time) * .4) * Math.exp(-progress * 28);
    } else if (definition.generator === "sparkle") {
      const tone = Math.sin(2 * Math.PI * (720 + progress * 1_500) * time) + .45 * Math.sin(2 * Math.PI * (1_120 + progress * 2_100) * time);
      value = tone * Math.sin(Math.PI * progress) * .55;
    } else if (definition.generator === "notification") {
      const first = time < definition.duration * .45 ? Math.sin(2 * Math.PI * 620 * time) * Math.sin(Math.PI * time / (definition.duration * .45)) : 0;
      const shifted = time - definition.duration * .42;
      const second = shifted > 0 ? Math.sin(2 * Math.PI * 920 * shifted) * Math.sin(Math.PI * Math.min(1, shifted / (definition.duration * .58))) : 0;
      value = (first + second) * .62;
    } else if (definition.generator === "riser") {
      filteredNoise += (noise - filteredNoise) * (.02 + progress * .2);
      const chirp = Math.sin(2 * Math.PI * (150 + progress * progress * 1_150) * time);
      value = (filteredNoise * .65 + chirp * .35) * progress ** 1.4 * (1 - Math.max(0, progress - .94) / .06);
    } else {
      const frequency = 520 - progress * 310;
      value = Math.sin(2 * Math.PI * frequency * time) * Math.exp(-progress * 4.5);
    }
    samples[frame] = Math.max(-1, Math.min(1, value * definition.gain));
  }
  const wav = encodeMonoWav(samples, SAMPLE_RATE);
  return new File([wav], `${definition.id}-${serial}.wav`, { type: "audio/wav", lastModified: Date.now() });
}

function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  write(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(view, 8, "WAVE");
  write(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index]!));
    view.setInt16(44 + index * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return bytes;
}

function write(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function hash(value: string) {
  let result = 2_166_136_261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16_777_619);
  return result >>> 0;
}

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ next >>> 15, next | 1);
    next ^= next + Math.imul(next ^ next >>> 7, next | 61);
    return ((next ^ next >>> 14) >>> 0) / 4_294_967_296;
  };
}
