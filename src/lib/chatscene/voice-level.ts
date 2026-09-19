/** Consistent dialogue loudness for individual previews and the final mix. */
export function dialogueGain(buffer: AudioBuffer, requested = 1): number {
  const base = Math.max(0.2, Math.min(1.8, requested));
  if (!Number.isFinite(base)) return 1;
  try {
    let peak = 0;
    const channels = Math.max(1, buffer.numberOfChannels);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      // Inspect every sample for the peak; a sparse transient must not clip.
      for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i] ?? 0));
    }
    if (!Number.isFinite(peak) || peak < 0.006) return base;

    // Ignore quiet gaps: provider padding should not make the spoken part too loud.
    const gate = Math.max(0.003, peak * 0.08);
    let energy = 0;
    let active = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const data = buffer.getChannelData(channel);
      const step = Math.max(1, Math.floor(data.length / 8_000));
      for (let i = 0; i < data.length; i += step) {
        const sample = data[i] ?? 0;
        if (Math.abs(sample) < gate) continue;
        energy += sample * sample;
        active += 1;
      }
    }
    if (!active) return base;
    const rms = Math.sqrt(energy / active);
    const correction = Math.max(0.45, Math.min(8, 0.126 / rms));
    // Leave headroom for simultaneous effects/music; the master is normalized later.
    return Math.min(base * correction, 0.9 / peak);
  } catch {
    // A legacy/test clip may carry no decoded PCM data.
    return base;
  }
}
