import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AttendeeHeatmap from '@/components/venues/AttendeeHeatmap';

const streamHeatmapUpdates = vi.fn();
vi.mock('@/lib/heatmap', async () => {
  const actual = await vi.importActual<typeof import('@/lib/heatmap')>('@/lib/heatmap');
  return {
    ...actual,
    stream_heatmap_updates: (...args: unknown[]) => {
      streamHeatmapUpdates(...args);
      return () => {};
    },
  };
});

describe('AttendeeHeatmap streaming mode', () => {
  beforeEach(() => {
    streamHeatmapUpdates.mockClear();
  });

  it('forwards its tileSize prop to stream_heatmap_updates (#1147)', () => {
    const fetchPositions = vi.fn().mockResolvedValue([]);
    render(<AttendeeHeatmap fetchPositions={fetchPositions} tileSize={25} intervalMs={1000} />);

    expect(streamHeatmapUpdates).toHaveBeenCalledWith(
      fetchPositions,
      expect.any(Function),
      1000,
      expect.objectContaining({ tileSize: 25 }),
    );
  });

  it('shows a connection-lost banner when the stream reports failures (#1148)', async () => {
    const fetchPositions = vi.fn().mockResolvedValue([]);
    render(<AttendeeHeatmap fetchPositions={fetchPositions} />);

    const [, , , options] = streamHeatmapUpdates.mock.calls[0];
    options.onError(new Error('down'), 2);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connection lost'));
    expect(screen.getByRole('status')).toHaveTextContent('2 failed attempts');
  });
});
