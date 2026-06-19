import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { frontispiece, xiuxiangPlate, colophon } from './plates';

// vtitle renders each character as its own <text>; assert per character, not contiguous.
test('frontispiece is a complete svg page containing the title', () => {
  const svg = frontispiece({ titleZh: '天命輓歌', titleEn: 'Elegy of the Mandate' });
  assertValidSvg(svg);
  expect(svg).toMatch(/^<svg/);
  for (const ch of '天命輓歌') expect(svg).toContain(`>${ch}</text>`);
  expect(svg).toContain('Elegy of the Mandate'); // English is a single <text>
});

test('xiuxiang plate names the figure', () => {
  const svg = xiuxiangPlate({ nameZh: '桑無咎', nameEn: 'Sang Wu-jiu' });
  assertValidSvg(svg);
  for (const ch of '桑無咎') expect(svg).toContain(`>${ch}</text>`);
});

test('colophon lists publication lines', () => {
  const svg = colophon({ lines: ['歲在丙午', '夢餘堂刊'] });
  assertValidSvg(svg);
  for (const ch of '夢餘堂刊') expect(svg).toContain(`>${ch}</text>`);
});
