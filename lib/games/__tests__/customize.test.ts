import { describe, expect, it } from 'vitest';
import {
  EMOTE_MOTIFS,
  cleanLook,
  emoteToken,
  parseBackground,
  parseFrame,
  splitEmotes,
  unlocksFromBadges,
} from '../customize';

const badges = [
  { gameId: 'altair', foil: false, level: 1 },
  { gameId: 'laundry-sort', foil: false, level: 5 },
  { gameId: 'laundry-sort', foil: true, level: 1 },
];

describe('unlocksFromBadges', () => {
  it('a badge unlocks its title’s background and emoticons', () => {
    const u = unlocksFromBadges([badges[0]]);
    expect(u.backgrounds).toEqual(['bg:altair']);
    expect(u.emoteTitles).toEqual(['altair']);
    expect(u.frames).toEqual([]);
  });

  it('a foil badge adds the foil background; levels 3 and 5 add frames', () => {
    const u = unlocksFromBadges(badges);
    expect(u.backgrounds).toEqual(['bg:altair', 'bg:laundry-sort', 'bg:laundry-sort:foil']);
    expect(u.frames).toEqual(['frame:laundry-sort:3', 'frame:laundry-sort:5']);
    expect(u.emoteTitles).toEqual(['altair', 'laundry-sort']);
  });

  it('level 3 unlocks only the first frame, and nothing unlocks without a badge', () => {
    expect(unlocksFromBadges([{ gameId: 'altair', foil: false, level: 3 }]).frames).toEqual(['frame:altair:3']);
    expect(unlocksFromBadges([])).toEqual({ backgrounds: [], frames: [], emoteTitles: [] });
  });
});

describe('keys', () => {
  it('parse backgrounds and frames, and reject the malformed', () => {
    expect(parseBackground('bg:altair')).toEqual({ gameId: 'altair', foil: false });
    expect(parseBackground('bg:laundry-sort:foil')).toEqual({ gameId: 'laundry-sort', foil: true });
    expect(parseBackground('altair')).toBeNull();
    expect(parseBackground('bg:')).toBeNull();
    expect(parseFrame('frame:altair:5')).toEqual({ gameId: 'altair', level: 5 });
    expect(parseFrame('frame:altair:4')).toBeNull();
    expect(parseFrame('frame:altair')).toBeNull();
  });
});

describe('cleanLook', () => {
  const owned = unlocksFromBadges(badges);

  it('keeps an owned choice and drops the rest', () => {
    expect(cleanLook({ background: 'bg:altair', frame: 'frame:laundry-sort:5' }, owned)).toEqual({
      background: 'bg:altair',
      frame: 'frame:laundry-sort:5',
    });
    expect(cleanLook({ background: 'bg:other', frame: 'frame:altair:3' }, owned)).toEqual({
      background: null,
      frame: null,
    });
  });

  it('null and junk mean "none"', () => {
    expect(cleanLook({ background: null, frame: 7 as unknown as string }, owned)).toEqual({ background: null, frame: null });
  });
});

describe('emoticons', () => {
  it('builds a token', () => {
    expect(emoteToken('laundry-sort', 'star')).toBe(':laundry-sort-star:');
    expect(EMOTE_MOTIFS).toContain('ring');
  });

  it('turns tokens into emotes only for titles the author owns', () => {
    const segs = splitEmotes('hi :altair-star: and :laundry-sort-hex: ok', new Set(['altair']));
    expect(segs).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'emote', gameId: 'altair', motif: 'star' },
      { type: 'text', text: ' and :laundry-sort-hex: ok' },
    ]);
  });

  it('leaves ordinary colons, unknown motifs and empty ownership alone', () => {
    expect(splitEmotes('time 10:30 :altair-sparkle: :altair-star:', new Set())).toEqual([
      { type: 'text', text: 'time 10:30 :altair-sparkle: :altair-star:' },
    ]);
    expect(splitEmotes('', new Set(['altair']))).toEqual([]);
  });

  it('handles back-to-back tokens and keeps surrounding text intact', () => {
    const segs = splitEmotes(':altair-star::altair-ring:x', new Set(['altair']));
    expect(segs.map((s) => (s.type === 'emote' ? s.motif : s.text))).toEqual(['star', 'ring', 'x']);
  });
});
