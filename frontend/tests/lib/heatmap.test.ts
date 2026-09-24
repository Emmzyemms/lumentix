import { describe, it, expect, vi } from 'vitest';
import {
  aggregateScanPositions,
  generateHeatmapTiles,
  streamHeatmapUpdates,
} from '@/lib/heatmap';

describe('heatmap lib', () => {
  it('exports camelCase function names (issue #1171)', () => {
    // Guards against the snake_case regression the issue describes.
    expect(typeof aggregateScanPositions).toBe('function');
    expect(typeof generateHeatmapTiles).toBe('function');
    expect(typeof streamHeatmapUpdates).toBe('function');
  });

  it('aggregates scan positions into per-zone buckets', () => {
    const aggregated = aggregateScanPositions([
      { x: 10, y: 20, timestamp: 1, zoneId: 'a' },
      { x: 15, y: 25, timestamp: 2, zoneId: 'a' },
      { x: 200, y: 210, timestamp: 3 },
    ]);
    expect(aggregated).toContainEqual({ key: 'a', x: 10, y: 20, count: 2 });
    expect(aggregated).toHaveLength(2);
  });

  it('generates normalised density tiles relative to the max bucket', () => {
    const aggregated = aggregateScanPositions([
      { x: 5, y: 5, timestamp: 1, zoneId: 'busy' },
      { x: 6, y: 6, timestamp: 2, zoneId: 'busy' },
      { x: 7, y: 7, timestamp: 3, zoneId: 'busy' },
      { x: 105, y: 5, timestamp: 4, zoneId: 'quiet' },
    ]);
    const tiles = generateHeatmapTiles(aggregated, 50);
    expect(tiles).toHaveLength(2);
    const busy = tiles.find((t) => t.x === 5);
    const quiet = tiles.find((t) => t.x === 105);
    expect(busy?.density).toBe(1);
    expect(quiet?.density).toBeCloseTo(1 / 3);
  });

  it('streams updates and stops on cleanup', async () => {
    vi.useFakeTimers();
    const onUpdate = vi.fn();
    const fetchPositions = vi
      .fn()
      .mockResolvedValueOnce([{ x: 1, y: 1, timestamp: 1 }])
      .mockResolvedValue([{ x: 2, y: 2, timestamp: 2 }]);

    const stop = streamHeatmapUpdates(fetchPositions, onUpdate, 100);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(onUpdate).toHaveBeenCalled();
    const firstCalls = onUpdate.mock.calls.length;

    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onUpdate.mock.calls.length).toBe(firstCalls);

    vi.useRealTimers();
  });
});