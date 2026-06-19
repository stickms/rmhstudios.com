import { test, expect } from 'vitest';
import { assertValidSvg } from './svg-test-utils';
import { blockFrame, columnRules } from './frame';

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1100">${inner}</svg>`;

test('blockFrame returns well-formed svg fragment with two rule rects', () => {
  const svg = wrap(blockFrame(800, 1100));
  assertValidSvg(svg);
  // outer + inner rule = at least two rect/path elements
  expect((svg.match(/<rect/g) || []).length).toBeGreaterThanOrEqual(2);
});

test('columnRules emits cols-1 separators', () => {
  const svg = wrap(columnRules(40, 40, 720, 1020, 10));
  assertValidSvg(svg);
  expect((svg.match(/<line/g) || []).length).toBe(9);
});
