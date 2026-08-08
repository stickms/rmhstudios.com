/**
 * V1, V4, V6 and V11 — skins, cover-derived palettes and the cosmetic-only rule.
 *
 * The load-bearing test here is `assertCosmeticOnly`. Everything else is a
 * lookup table; that one is a policy, and a policy that is only written in a
 * comment erodes one well-meaning shop item at a time.
 */

import { describe, expect, it } from 'vitest';
import { contrastRatio, LANE_PALETTES } from '../palettes';
import {
  CosmeticOnlyViolation,
  FREE_SKIN_IDS,
  SKINS,
  assertCosmeticOnly,
  coverLanePair,
  coverPalette,
  hslToHex,
  resolveSkin,
  seasonFor,
  type Hsl,
  type NoteShape,
} from '../skins';

describe('V1 — skins', () => {
  it('falls back to default for an unknown or cleared id', () => {
    // A persisted skin id outlives the skin it names, so the empty string and a
    // deleted id both have to land somewhere playable rather than undefined.
    expect(resolveSkin(undefined).id).toBe('default');
    expect(resolveSkin('').id).toBe('default');
    expect(resolveSkin('a-skin-that-was-removed').id).toBe('default');
  });

  it('names a palette that actually exists', () => {
    for (const skin of Object.values(SKINS)) {
      const known = skin.palette === 'cover' || skin.palette in LANE_PALETTES;
      expect(known, `${skin.id} → ${skin.palette}`).toBe(true);
    }
  });

  it('leaves the default skin unlocked', () => {
    // Every other skin may gate; the one a new player starts on may not.
    expect(SKINS.default.unlock).toBeNull();
  });

  it('keys every entry by its own id', () => {
    for (const [key, skin] of Object.entries(SKINS)) expect(skin.id).toBe(key);
  });

  it('defaults to notation, which is the only shape that carries the rhythm', () => {
    // The subdivision used to be hue-only — and `QUANT_COLORS[1]` is the bomb's
    // exact colour. Notation puts it on shape instead (identical head, a flag
    // per subdivision), so this default is an accessibility property, not a
    // taste one, and moving it should be a deliberate act.
    expect(SKINS.default.noteShape).toBe('notation');
  });

  it('offers a real choice without an unlock', () => {
    // A skin picker whose only free entry is the default is not a picker.
    expect(FREE_SKIN_IDS).toContain('default');
    expect(FREE_SKIN_IDS.length).toBeGreaterThanOrEqual(4);
    for (const id of FREE_SKIN_IDS) expect(SKINS[id].unlock).toBeNull();
  });

  it('lists only skins that exist, and every unlock-free skin', () => {
    for (const id of FREE_SKIN_IDS) expect(SKINS[id]).toBeDefined();
    const free = Object.values(SKINS)
      .filter((skin) => skin.unlock === null)
      .map((skin) => skin.id);
    expect([...FREE_SKIN_IDS].sort()).toEqual(free.sort());
  });

  it('keeps every skin on a shape the renderer knows how to draw', () => {
    // `traceNoteBody` switches on this and falls back to `pill`; a typo would
    // silently give a skin the default body rather than failing.
    const drawable: NoteShape[] = ['notation', 'pill', 'circle', 'bar', 'arrow'];
    for (const skin of Object.values(SKINS)) {
      expect(drawable, `${skin.id} → ${skin.noteShape}`).toContain(skin.noteShape);
    }
  });
});

describe('V6 — the cosmetic-only guarantee', () => {
  it('allows a purely visual item', () => {
    expect(() =>
      assertCosmeticOnly('slice-skin-neon', { skin: 'neon', hitBurst: 'ring' }),
    ).not.toThrow();
  });

  it('rejects an item that touches scroll speed', () => {
    // The exact failure this exists to stop: a shop item that lets a paying
    // player read incoming notes for longer than everyone else.
    expect(() => assertCosmeticOnly('slice-boost', { scrollSpeed: 2 })).toThrow(
      CosmeticOnlyViolation,
    );
  });

  it('names every offending property, not just the first', () => {
    // A shop author fixing one and re-running should not discover the second on
    // the next attempt.
    try {
      assertCosmeticOnly('slice-cheat', { noteSize: 2, laneCoverHeight: 0.4, skin: 'neon' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CosmeticOnlyViolation);
      expect((error as Error).message).toContain('noteSize');
      expect((error as Error).message).toContain('laneCoverHeight');
    }
  });

  it('rejects a gameplay property even when set to undefined', () => {
    // `in` rather than a truthiness check on purpose — an item declaring the
    // key at all is a shop item reaching into gameplay, and `{scrollSpeed:
    // undefined}` spread over settings still clobbers the player's value.
    expect(() => assertCosmeticOnly('slice-sneaky', { scrollSpeed: undefined })).toThrow(
      CosmeticOnlyViolation,
    );
  });
});

describe('V4 — cover-derived lane colours', () => {
  const dominants: Hsl[] = [
    { h: 0, s: 0.8, l: 0.5 },
    { h: 45, s: 0.6, l: 0.75 },
    { h: 210, s: 0.9, l: 0.2 },
    { h: 300, s: 0.1, l: 0.5 },
    { h: 120, s: 0, l: 0.5 },
  ];

  it('always produces a readable pair', () => {
    // Extracted colour is a suggestion, not a palette: two lanes the same
    // brightness are the same object at the speed a note crosses the screen.
    for (const dominant of dominants) {
      const [first, second] = coverLanePair(dominant);
      expect(contrastRatio(first, second), JSON.stringify(dominant)).toBeGreaterThanOrEqual(1.6);
    }
  });

  it('is deterministic for the same cover', () => {
    expect(coverLanePair(dominants[0])).toEqual(coverLanePair(dominants[0]));
  });

  it('keeps the bomb colour off the album art', () => {
    // The one object whose meaning must not shift with the artwork.
    expect(coverPalette(dominants[0]).bomb).toBe(LANE_PALETTES.default.bomb);
    expect(coverPalette(dominants[2]).bomb).toBe(LANE_PALETTES.default.bomb);
  });

  it('emits parseable hex for the whole hue circle', () => {
    for (let h = 0; h < 360; h += 15) {
      expect(hslToHex({ h, s: 0.7, l: 0.5 })).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('round-trips the achromatic ends', () => {
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe('#000000');
    expect(hslToHex({ h: 0, s: 0, l: 1 })).toBe('#ffffff');
  });
});

describe('V11 — seasonal treatment', () => {
  it('maps the year onto four seasons in UTC', () => {
    expect(seasonFor(new Date('2026-01-15T00:00:00Z'))).toBe('winter');
    expect(seasonFor(new Date('2026-03-15T00:00:00Z'))).toBe('spring');
    expect(seasonFor(new Date('2026-07-15T00:00:00Z'))).toBe('summer');
    expect(seasonFor(new Date('2026-10-15T00:00:00Z'))).toBe('autumn');
    expect(seasonFor(new Date('2026-12-15T00:00:00Z'))).toBe('winter');
  });

  it('covers every month', () => {
    for (let month = 0; month < 12; month++) {
      const season = seasonFor(new Date(Date.UTC(2026, month, 15)));
      expect(season).not.toBe('none');
    }
  });
});
