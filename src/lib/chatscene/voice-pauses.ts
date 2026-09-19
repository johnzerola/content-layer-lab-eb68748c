/** Shorten long silent gaps in generated speech without changing the spoken samples. */
export function compactGeneratedSpeech(
  input: AudioBuffer,
  createBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer,
): AudioBuffer {
  const sampleRate = input.sampleRate;
  const length = input.length;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || length < sampleRate / 4) return input;

  const channels = Array.from({ length: input.numberOfChannels }, (_, index) => input.getChannelData(index));
  const window = Math.max(1, Math.round(sampleRate * 0.01));
  const windows = Math.ceil(length / window);
  let peak = 0;
  for (const samples of channels) {
    for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  }
  if (peak < 0.006) return input;

  const threshold = Math.max(0.0025, peak * 0.025);
  const voiced = new Uint8Array(windows);
  for (let index = 0; index < windows; index += 1) {
    const start = index * window;
    const end = Math.min(length, start + window);
    let energy = 0;
    for (const samples of channels) {
      for (let i = start; i < end; i += 1) energy += (samples[i] ?? 0) ** 2;
    }
    voiced[index] = Math.sqrt(energy / ((end - start) * channels.length)) >= threshold ? 1 : 0;
  }

  const first = voiced.indexOf(1);
  const last = voiced.lastIndexOf(1);
  if (first < 0) return input;
  const head = Math.max(0, first * window - Math.round(sampleRate * 0.03));
  const tail = Math.min(length, (last + 1) * window + Math.round(sampleRate * 0.05));
  const ranges: Array<[number, number]> = [];
  let start = head;
  for (let index = first; index <= last; index += 1) {
    if (voiced[index]) continue;
    const silenceStart = index;
    while (index <= last && !voiced[index]) index += 1;
    const silenceEnd = index * window;
    if (silenceEnd - silenceStart * window < sampleRate * 0.22) continue;
    const before = Math.min(tail, silenceStart * window + Math.round(sampleRate * 0.06));
    const after = Math.max(before, silenceEnd - Math.round(sampleRate * 0.06));
    if (before > start) ranges.push([start, before]);
    start = after;
  }
  if (tail > start) ranges.push([start, tail]);
  const outputLength = ranges.reduce((sum, [from, to]) => sum + to - from, 0);
  if (outputLength <= 0 || outputLength >= length) return input;

  const output = createBuffer(channels.length, outputLength, sampleRate);
  for (let channel = 0; channel < channels.length; channel += 1) {
    const target = output.getChannelData(channel);
    let offset = 0;
    for (const [from, to] of ranges) {
      target.set(channels[channel]!.subarray(from, to), offset);
      offset += to - from;
    }
  }
  return output;
}
