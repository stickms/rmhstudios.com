import { describe, expect, it } from 'vitest';
import { computeDora, renderMarkdown } from '../../.github/scripts/dora-metrics.mjs';

const run = (conclusion: string, merged: string, finished: string) => ({
  conclusion,
  head_commit: { timestamp: merged },
  updated_at: finished,
});

describe('delivery metrics', () => {
  it('computes frequency, lead time, failure rate and time to restore', () => {
    const metrics = computeDora(
      [
        run('success', '2026-10-01T00:00:00Z', '2026-10-01T00:06:00Z'),
        run('failure', '2026-10-02T00:00:00Z', '2026-10-02T00:05:00Z'),
        run('success', '2026-10-02T01:00:00Z', '2026-10-02T01:10:00Z'),
        run('cancelled', '2026-10-03T00:00:00Z', '2026-10-03T00:01:00Z'),
      ],
      10,
    );
    expect(metrics.deploys).toBe(2);
    expect(metrics.deploysPerDay).toBe(0.2);
    expect(metrics.changeFailureRate).toBeCloseTo(1 / 3, 2);
    expect(metrics.timeToRestoreMedianMin).toBe(65);
    expect(metrics.leadTimeMedianMin).toBe(10);
  });
  it('reports n/a instead of inventing numbers for an empty window', () => {
    const metrics = computeDora([], 30);
    expect(metrics.changeFailureRate).toBeNull();
    expect(renderMarkdown(metrics)).toContain('n/a');
  });
});
