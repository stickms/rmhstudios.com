import { describe, expect, it } from 'vitest';
import {
  PLACE_LEAD_MAX_PX,
  PLACE_LEAD_MS,
  SCROLL_STALE_MS,
  ballCentreY,
  predictScrollY,
} from '../globe-scroll-track';

describe('ballCentreY', () => {
  it('is unchanged while the visual viewport is', () => {
    expect(ballCentreY(700, 800, 800)).toBe(700);
  });
  it('follows the visible bottom 1:1: a shorter viewport (toolbar grew) moves it up, a taller one down', () => {
    expect(ballCentreY(700, 800, 740)).toBe(640);
    expect(ballCentreY(700, 740, 800)).toBe(760);
  });
});

describe('predictScrollY', () => {
  it('looks ahead by the lead at the speed of the last two events', () => {
    // 1 px/ms for one lead's worth of time
    expect(predictScrollY(110, 100, 10)).toBeCloseTo(110 + PLACE_LEAD_MS * 1, 5);
    expect(predictScrollY(90, 100, 10)).toBeCloseTo(
      90 - Math.min(PLACE_LEAD_MS, PLACE_LEAD_MAX_PX),
      5,
    );
  });
  it('never looks further ahead than the cap, either direction', () => {
    expect(predictScrollY(1000, 0, 16)).toBe(1000 + PLACE_LEAD_MAX_PX);
    expect(predictScrollY(0, 1000, 16)).toBe(0 - PLACE_LEAD_MAX_PX);
  });
  it('does not guess without a usable previous event', () => {
    expect(predictScrollY(500, null, 16)).toBe(500);
    expect(predictScrollY(500, 480, 0)).toBe(500);
    expect(predictScrollY(500, 480, -4)).toBe(500);
    expect(predictScrollY(500, 480, SCROLL_STALE_MS + 1)).toBe(500);
  });
  it('is the offset itself when the page is not moving', () => {
    expect(predictScrollY(500, 500, 16)).toBe(500);
  });
});
