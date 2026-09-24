import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { stream_heatmap_updates, type ScanPosition, type HeatmapTile } from '@/lib/heatmap';

function position(x: number, y: number): ScanPosition {
  return { x, y, timestamp: Date.now() };
}

describe('stream_heatmap_updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Analytics-style regression test for the tileSize plumbing bug (#1147):
  // streaming mode must compute tiles on the caller's tileSize, not the
  // hard-coded default of 50.
  it('uses the provided tileSize instead of the hard-coded default', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([position(120, 120)]);
    const onUpdate = vi.fn<(tiles: HeatmapTile[]) => void>();

    const stop = stream_heatmap_updates(fetchPositions, onUpdate, 5000, { tileSize: 40 });
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    const [tiles] = onUpdate.mock.calls[0];
    expect(tiles[0].tileX).toBe(3); // 120 / 40
    expect(tiles[0].tileY).toBe(3);

    stop();
  });

  it('falls back to a tileSize of 50 when none is provided', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([position(120, 120)]);
    const onUpdate = vi.fn<(tiles: HeatmapTile[]) => void>();

    const stop = stream_heatmap_updates(fetchPositions, onUpdate);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    const [tiles] = onUpdate.mock.calls[0];
    expect(tiles[0].tileX).toBe(2); // 120 / 50

    stop();
  });

  // Regression tests for #1148: failures must be surfaced via onError and
  // retried with growing (capped) backoff, not a fixed-interval loop.
  it('surfaces fetch failures via onError with an increasing failure count', async () => {
    const fetchPositions = vi.fn().mockRejectedValue(new Error('network down'));
    const onUpdate = vi.fn();
    const onError = vi.fn();

    const stop = stream_heatmap_updates(fetchPositions, onUpdate, 1000, { onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenLastCalledWith(expect.any(Error), 1);

    await vi.advanceTimersByTimeAsync(2000); // backoff after 1st failure: 1000 * 2^1
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenLastCalledWith(expect.any(Error), 2);

    expect(onUpdate).not.toHaveBeenCalled();
    stop();
  });

  it('caps the backoff delay at maxBackoffMs', async () => {
    const fetchPositions = vi.fn().mockRejectedValue(new Error('network down'));
    const onError = vi.fn();

    const stop = stream_heatmap_updates(fetchPositions, vi.fn(), 1000, {
      onError,
      maxBackoffMs: 3000,
    });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1)); // fails immediately

    // Without a cap, failure #4 would wait 1000 * 2^4 = 16000ms.
    // With maxBackoffMs=3000, every subsequent retry should be capped at 3000ms.
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);

    expect(onError).toHaveBeenCalledTimes(4);
    stop();
  });

  it('resets the failure count and resumes normal updates after a success', async () => {
    const fetchPositions = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue([position(10, 10)]);
    const onUpdate = vi.fn();
    const onError = vi.fn();

    const stop = stream_heatmap_updates(fetchPositions, onUpdate, 1000, { onError });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(2000); // backoff for failure #1
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    stop();
  });

  it('stops polling once the returned cleanup function is called', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([position(10, 10)]);
    const onUpdate = vi.fn();

    const stop = stream_heatmap_updates(fetchPositions, onUpdate, 1000);
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));

    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(fetchPositions).toHaveBeenCalledTimes(1);
  });
});
