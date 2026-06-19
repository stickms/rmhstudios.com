import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { seal } from './seal';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">${inner}</svg>`;

test('intaglio seal is a solid red block with reversed glyphs', () => {
  const svg = wrap(seal({ x: 20, y: 20, size: 160, text: '天命', style: 'intaglio' }));
  assertValidSvg(svg);
  expect(svg).toContain('#b03a2e');
  expect(svg).toContain('天');
  expect(svg).toContain('命');
});

test('relief seal renders red glyphs', () => {
  const svg = wrap(seal({ x: 20, y: 20, size: 160, text: '頒行', style: 'relief' }));
  assertValidSvg(svg);
  expect(svg).toContain('頒');
});
