import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForEncoderCapacity } from '../encoder-capacity';

class Encoder extends EventTarget {
  encodeQueueSize = 8;
  state = 'configured';
  ondequeue = null;
}

describe('encoder capacity', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('continues immediately when a dequeue event frees capacity', async () => {
    const encoder = new Encoder();
    const done = waitForEncoderCapacity(encoder as unknown as VideoEncoder, () => false, () => null);
    encoder.encodeQueueSize = 6; encoder.dispatchEvent(new Event('dequeue'));
    await done; expect(vi.getTimerCount()).toBe(0);
  });
  it('does not allocate a polling timer when there is already capacity', async () => {
    const encoder = new Encoder(); encoder.encodeQueueSize = 0;
    await waitForEncoderCapacity(encoder as unknown as VideoEncoder, () => false, () => null);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('releases listeners and timers on cancellation', async () => {
    const encoder = new Encoder(); let cancelled = false;
    const remove = vi.spyOn(encoder, 'removeEventListener');
    const done = waitForEncoderCapacity(encoder as unknown as VideoEncoder, () => cancelled, () => null);
    const assertion = expect(done).rejects.toMatchObject({ name: 'AbortError' });
    cancelled = true; await vi.advanceTimersByTimeAsync(250); await assertion;
    expect(remove).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates encoder errors and rejects a stalled queue within its deadline', async () => {
    const encoder = new Encoder();
    await expect(waitForEncoderCapacity(encoder as unknown as VideoEncoder, () => false, () => new Error('codec error'))).rejects.toThrow('codec error');
    const stalled = waitForEncoderCapacity(encoder as unknown as VideoEncoder, () => false, () => null, 6, 500);
    const assertion = expect(stalled).rejects.toThrow('parou de responder');
    await vi.advanceTimersByTimeAsync(500); await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('supports encoders that do not emit dequeue events', async () => {
    const encoder = Object.assign(new EventTarget(), { encodeQueueSize: 8, state: 'configured' });
    const done = waitForEncoderCapacity(encoder as unknown as VideoEncoder, () => false, () => null);
    encoder.encodeQueueSize = 0; await vi.advanceTimersByTimeAsync(16); await done;
    expect(vi.getTimerCount()).toBe(0);
  });
});
