import { describe, expect, it } from 'vitest';
import {
  SCROLL_TRACK_HOLD_MS,
  VIEWPORT_TRACK_HOLD_MS,
  trackStep,
  type TrackState,
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

describe('trackStep', () => {
  const fresh = (): TrackState => ({ lastY: 1000, lastT: 0, lastVv: 800, until: 0 });

  it('keeps going while the page moves and extends by the hold each moving frame', () => {
    const s = fresh();
    const a = trackStep(s, 1010, 800, 16);
    expect(a.keep).toBe(true);
    expect(s.until).toBe(16 + SCROLL_TRACK_HOLD_MS);
    trackStep(s, 1020, 800, 32);
    expect(s.until).toBe(32 + SCROLL_TRACK_HOLD_MS);
  });

  it('predicts from the last FRAME: 10 px in 16 ms leads by the lead at that speed', () => {
    const s = fresh();
    s.lastT = 0;
    const { ahead } = trackStep(s, 1010, 800, 16);
    expect(ahead).toBeGreaterThan(1010);
    expect(ahead).toBeLessThanOrEqual(1010 + PLACE_LEAD_MAX_PX);
  });

  it('stops once nothing has moved for the hold, and places at the offset itself', () => {
    const s = fresh();
    trackStep(s, 1010, 800, 16);
    const rest = trackStep(s, 1010, 800, 16 + SCROLL_TRACK_HOLD_MS + 1);
    expect(rest.keep).toBe(false);
    expect(rest.ahead).toBe(1010);
  });

  it('a viewport change alone (the toolbar) moves it, and the longer viewport hold outlasts the scroll hold', () => {
    const s = fresh();
    const a = trackStep(s, 1000, 760, 16, VIEWPORT_TRACK_HOLD_MS);
    expect(a.keep).toBe(true);
    expect(s.until).toBe(16 + VIEWPORT_TRACK_HOLD_MS);
    // 300 ms later the toolbar is still animating (viewport still changing): extended, not stopped
    const b = trackStep(s, 1000, 740, 316, VIEWPORT_TRACK_HOLD_MS);
    expect(b.keep).toBe(true);
    expect(s.until).toBe(316 + VIEWPORT_TRACK_HOLD_MS);
    expect(VIEWPORT_TRACK_HOLD_MS).toBeGreaterThan(SCROLL_TRACK_HOLD_MS);
  });

  it('a hold never shortens a longer one already running', () => {
    const s = fresh();
    trackStep(s, 1000, 760, 0, VIEWPORT_TRACK_HOLD_MS);
    trackStep(s, 1000, 750, 16, SCROLL_TRACK_HOLD_MS);
    expect(s.until).toBe(VIEWPORT_TRACK_HOLD_MS);
  });
});
