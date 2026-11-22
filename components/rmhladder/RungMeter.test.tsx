/**
 * RungMeter — render-to-string unit tests.
 * No DOM library needed; assertions on HTML string data attributes.
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RungMeter } from './RungMeter';

function countFilled(html: string): number {
  return (html.match(/data-filled="true"/g) ?? []).length;
}

function getTone(html: string): string | null {
  const m = html.match(/data-tone="([^"]+)"/);
  return m ? m[1] : null;
}

function getAriaLabel(html: string): string | null {
  const m = html.match(/aria-label="([^"]+)"/);
  return m ? m[1] : null;
}

describe('RungMeter', () => {
  it('score 0 → 0 filled', () => {
    const html = renderToString(<RungMeter score={0} />);
    expect(countFilled(html)).toBe(0);
  });

  it('score 1 → 1 filled', () => {
    const html = renderToString(<RungMeter score={1} />);
    expect(countFilled(html)).toBe(1);
  });

  it('score 39 → 2 filled', () => {
    const html = renderToString(<RungMeter score={39} />);
    expect(countFilled(html)).toBe(2);
  });

  it('score 40 → 2 filled (Math.ceil(40/20)=2)', () => {
    const html = renderToString(<RungMeter score={40} />);
    expect(countFilled(html)).toBe(2);
  });

  it('score 41 → 3 filled', () => {
    const html = renderToString(<RungMeter score={41} />);
    expect(countFilled(html)).toBe(3);
  });

  it('score 80 → 4 filled, tone brass', () => {
    const html = renderToString(<RungMeter score={80} />);
    expect(countFilled(html)).toBe(4);
    expect(getTone(html)).toBe('brass');
  });

  it('score 81 → 5 filled, tone ledger', () => {
    const html = renderToString(<RungMeter score={81} />);
    expect(countFilled(html)).toBe(5);
    expect(getTone(html)).toBe('ledger');
  });

  it('score 100 → 5 filled, tone ledger', () => {
    const html = renderToString(<RungMeter score={100} />);
    expect(countFilled(html)).toBe(5);
    expect(getTone(html)).toBe('ledger');
  });

  it('score 240 (over-range) → clamped to 100, 5 filled, ledger', () => {
    const html = renderToString(<RungMeter score={240} />);
    expect(countFilled(html)).toBe(5);
    expect(getTone(html)).toBe('ledger');
    expect(getAriaLabel(html)).toBe('relevance 100 of 100');
  });

  it('score -5 → clamped to 0, 0 filled, label "relevance 0 of 100"', () => {
    const html = renderToString(<RungMeter score={-5} />);
    expect(countFilled(html)).toBe(0);
    expect(getAriaLabel(html)).toBe('relevance 0 of 100');
  });
});
