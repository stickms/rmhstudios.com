/**
 * The miss heat row: four strengths by miss rate, and the same facts as text (never colour alone). Rendered to static
 * markup; there is no DOM in the test environment.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HEAT_CLASS, HeatRowView } from '../HeatRow';

const bucket = (from: number, rate: number | null, attempts = rate === null ? 0 : 20) => ({
  from,
  to: from + 3,
  attempts,
  misses: rate === null ? 0 : Math.round(rate * attempts),
  rate,
});

const label = (b: { from: number; to: number; rate: number | null }) =>
  b.rate === null ? `${b.from} to ${b.to}: no data` : `${b.from} to ${b.to}: ${Math.round(b.rate * 100)}% missed`;

function render(buckets: ReturnType<typeof bucket>[]) {
  return renderToStaticMarkup(
    <HeatRowView buckets={buckets} caption="Where players miss, based on 12 sampled runs" bucketLabel={label} />,
  );
}

describe('HeatRowView', () => {
  it('tints a bucket in one of four steps by its miss rate, and leaves an unreached one untinted', () => {
    const html = render([bucket(0, null), bucket(3, 0.05), bucket(6, 0.2), bucket(9, 0.4), bucket(12, 0.8)]);
    const steps = [...html.matchAll(/data-heat="(\d)"/g)].map((m) => m[1]);
    expect(steps).toEqual(['0', '1', '2', '3', '4']);
    for (const step of [1, 2, 3, 4] as const) expect(html).toContain(HEAT_CLASS[step].split(' ')[0]);
  });

  it('gives every bucket its time range and rate as text', () => {
    const html = render([bucket(0, null), bucket(3, 0.2), bucket(6, 0.8)]);
    expect(html).toContain('aria-label="0 to 3: no data"');
    expect(html).toContain('title="3 to 6: 20% missed"');
    expect(html).toContain('aria-label="6 to 9: 80% missed"');
  });

  it('names the strip and says how many runs it is based on', () => {
    const html = render([bucket(0, 0.2)]);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Where players miss, based on 12 sampled runs"');
    expect(html).toContain('>Where players miss, based on 12 sampled runs</p>');
  });

  it('keeps one tab stop, on the first bucket anyone reached', () => {
    const html = render([bucket(0, null), bucket(3, 0.2), bucket(6, 0.8)]);
    expect([...html.matchAll(/tabindex="(-?\d)"/g)].map((m) => m[1])).toEqual(['-1', '0', '-1']);
  });

  it('draws nothing moving: no animation or transition classes', () => {
    const html = render([bucket(0, 0.2), bucket(3, 0.9)]);
    expect(html).not.toMatch(/animate|transition/);
  });
});
