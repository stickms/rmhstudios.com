import { describe, expect, it } from 'vitest';
import { viewportFitTranslation } from '../viewport-fit';

describe('viewportFitTranslation', () => {
  const bounds = { left: 12, top: 20, right: 308, bottom: 620 };

  it('leaves an on-screen popover untouched', () => {
    expect(viewportFitTranslation({ left: 40, top: 80, right: 240, bottom: 300 }, bounds)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('moves overflowing bottom-right content back into view', () => {
    expect(
      viewportFitTranslation({ left: 180, top: 500, right: 340, bottom: 680 }, bounds),
    ).toEqual({ x: -32, y: -60 });
  });

  it('respects a visual viewport whose origin is offset', () => {
    expect(viewportFitTranslation({ left: 0, top: 0, right: 160, bottom: 120 }, bounds)).toEqual({
      x: 12,
      y: 20,
    });
  });
});
