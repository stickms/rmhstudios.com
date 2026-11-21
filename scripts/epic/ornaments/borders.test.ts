import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { fretBorder, cloudMotif } from './borders';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100">${inner}</svg>`;

test('fretBorder is valid and made of stroked paths', () => {
  const svg = wrap(fretBorder(40, 40, 720, 1020));
  assertValidSvg(svg);
  expect((svg.match(/<path/g) || []).length).toBeGreaterThan(0);
});

test('cloudMotif is valid svg', () => {
  const svg = wrap(cloudMotif(100, 100, 1));
  assertValidSvg(svg);
});
