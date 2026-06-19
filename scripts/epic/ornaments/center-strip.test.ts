import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { centerStrip } from './center-strip';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100">${inner}</svg>`;

test('centerStrip is valid svg containing the title, juan and page', () => {
  const svg = wrap(centerStrip({ x: 380, y: 40, w: 40, h: 1020, title: '天命輓歌', juan: '卷一', page: '三' }));
  assertValidSvg(svg);
  // vlabel renders each character as its own <text> element (vertical run)
  for (const ch of '天命輓歌') expect(svg).toContain(`>${ch}</text>`);
  for (const ch of '卷一') expect(svg).toContain(`>${ch}</text>`);
  expect(svg).toContain('>三</text>');
  // the fishtail is a filled path
  expect(svg).toMatch(/<path[^>]+fill="#1a1410"/);
});
