import { describe, expect, it } from 'vitest';

import { clipRegion, roomFromRects, sameRoom, type RoomRect } from '../room';

const host: RoomRect = { left: 100, top: 100, right: 408, bottom: 276 };
const vp = { left: 0, right: 1280 };
const free = { top: 16, right: 16, bottom: 16, left: 16 };

describe('roomFromRects', () => {
  it('a free host gets the whole margin on every side', () => {
    expect(roomFromRects(host, [], vp, [], 16)).toEqual(free);
  });

  it('a clipping ancestor 3px above the host leaves 3px on top and the rest free', () => {
    const clip: RoomRect = { left: 0, top: 97, right: 1000, bottom: 900 };
    expect(roomFromRects(host, [clip], vp, [], 16)).toEqual({ ...free, top: 3 });
  });

  it('the tightest of several clips wins on each side', () => {
    const a: RoomRect = { left: 90, top: 0, right: 1000, bottom: 900 };
    const b: RoomRect = { left: 60, top: 0, right: 1000, bottom: 900 };
    expect(roomFromRects(host, [a, b], vp, [], 16).left).toBe(10);
  });

  it('a host flush with the viewport edge, or wider than its clip, has 0 there', () => {
    expect(roomFromRects({ ...host, left: 0 }, [], vp, [], 16).left).toBe(0);
    expect(roomFromRects({ ...host, right: 1280 }, [], vp, [], 16).right).toBe(0);
    const narrow: RoomRect = { left: 120, top: 0, right: 300, bottom: 900 };
    const r = roomFromRects(host, [narrow], vp, [], 16);
    expect(r.left).toBe(0);
    expect(r.right).toBe(0);
  });

  it('half the gap to a neighbour 16px below, none for a neighbour that does not share a span', () => {
    const below: RoomRect = { left: 100, top: 292, right: 408, bottom: 400 };
    expect(roomFromRects(host, [], vp, [below], 16).bottom).toBe(8);
    const diagonal: RoomRect = { left: 500, top: 292, right: 700, bottom: 400 };
    expect(roomFromRects(host, [], vp, [diagonal], 16)).toEqual(free);
    const right: RoomRect = { left: 424, top: 100, right: 600, bottom: 276 };
    expect(roomFromRects(host, [], vp, [right], 16).right).toBe(8);
  });

  it('touching or overlapping neighbours give 0 toward each other; unrelated overlap is ignored', () => {
    const touching: RoomRect = { left: 100, top: 276, right: 408, bottom: 400 };
    expect(roomFromRects(host, [], vp, [touching], 16).bottom).toBe(0);
    const inside: RoomRect = { left: 120, top: 120, right: 200, bottom: 200 };
    expect(roomFromRects(host, [], vp, [inside], 16)).toEqual(free);
  });

  it('never exceeds the margin and turns non-finite input into 0 room', () => {
    expect(roomFromRects(host, [], vp, [], 40)).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
    const bad = roomFromRects({ ...host, left: Number.NaN }, [], vp, [], 16);
    expect(Number.isFinite(bad.left + bad.right + bad.top + bad.bottom)).toBe(true);
    expect(roomFromRects(host, [], vp, [], Number.NaN)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});

describe('clipRegion / sameRoom', () => {
  it('the clipped region is the padding box: border widths and scrollbar excluded', () => {
    const r = clipRegion({ left: 10, top: 20, right: 210, bottom: 120 }, 1, 2, 183, 96);
    expect(r).toEqual({ left: 11, top: 22, right: 194, bottom: 118 });
  });

  it('sameRoom tolerates sub-pixel drift only', () => {
    expect(sameRoom(free, { ...free, top: 15.5 })).toBe(true);
    expect(sameRoom(free, { ...free, top: 14 })).toBe(false);
  });
});
