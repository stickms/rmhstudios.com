/**
 * Sound on flashcards (s10-02), the pure rules: the limits, a transcript is required, which sides a kind takes, how a
 * generated card reads its source's sounds, and that nothing reaches a viewer who does not own the deck.
 */
import { describe, expect, it } from 'vitest';
import {
  CARD_SOUND_MAX_BYTES,
  CARD_SOUND_MAX_MS,
  CARD_SOUND_TEXT_MAX,
  MAX_CARD_SOUNDS,
  cardSoundFilename,
  cardSoundProblem,
  formatSoundLength,
  fromSoundColumns,
  hasSounds,
  isCardSoundOwnedBy,
  isCardSoundUrl,
  normalizeSounds,
  soundFields,
  soundUrls,
  soundsOfRow,
  toSoundColumns,
} from '@/lib/study/card-sound';

const url = (name = 'me-abc.webm') => `/api/study/card-sound/${name}`;
const sound = (over: Partial<{ url: string; transcript: string; durationMs: number }> = {}) => ({
  url: url(),
  transcript: 'hola',
  durationMs: 2000,
  ...over,
});

describe('limits', () => {
  it('are the specified ones', () => {
    expect(MAX_CARD_SOUNDS).toBe(200);
    expect(CARD_SOUND_MAX_BYTES).toBe(512 * 1024);
    expect(CARD_SOUND_MAX_MS).toBe(15_000);
    expect(CARD_SOUND_TEXT_MAX).toBe(500);
  });
});

describe('cardSoundProblem', () => {
  it('needs a transcript, after trimming', () => {
    expect(cardSoundProblem('basic', { backSound: sound({ transcript: '' }) })).toEqual({
      code: 'TEXT_REQUIRED',
      side: 'back',
    });
    expect(cardSoundProblem('basic', { frontSound: sound({ transcript: '   \n' }) })).toEqual({
      code: 'TEXT_REQUIRED',
      side: 'front',
    });
    expect(cardSoundProblem('basic', { frontSound: sound() })).toBeNull();
  });

  it('caps the transcript at 500 characters', () => {
    expect(cardSoundProblem('basic', { backSound: sound({ transcript: 'x'.repeat(500) }) })).toBeNull();
    expect(cardSoundProblem('basic', { backSound: sound({ transcript: 'x'.repeat(501) }) })).toEqual({
      code: 'TEXT_TOO_LONG',
      side: 'back',
    });
  });

  it('takes a length of 1 to 15,000 ms', () => {
    for (const durationMs of [0, -5, 15_001, 1.5, Number.NaN]) {
      expect(cardSoundProblem('basic', { backSound: sound({ durationMs }) }), String(durationMs)).toEqual({
        code: 'DURATION_INVALID',
        side: 'back',
      });
    }
    expect(cardSoundProblem('basic', { backSound: sound({ durationMs: 1 }) })).toBeNull();
    expect(cardSoundProblem('basic', { backSound: sound({ durationMs: 15_000 }) })).toBeNull();
  });

  it('takes only addresses the upload produces, and never one object on both sides', () => {
    expect(cardSoundProblem('basic', { backSound: sound({ url: 'https://example.com/a.webm' }) })).toEqual({
      code: 'URL_INVALID',
      side: 'back',
    });
    expect(cardSoundProblem('basic', { backSound: sound({ url: '/api/study/card-sound/../x.webm' }) })).toEqual({
      code: 'URL_INVALID',
      side: 'back',
    });
    expect(cardSoundProblem('basic', { frontSound: sound(), backSound: sound() })).toEqual({
      code: 'URL_INVALID',
      side: 'back',
    });
    expect(cardSoundProblem('basic', { frontSound: sound(), backSound: sound({ url: url('me-def.ogg') }) })).toBeNull();
  });

  it('gives a cloze or occlusion card a back sound only', () => {
    for (const kind of ['cloze', 'occlusion']) {
      expect(cardSoundProblem(kind, { frontSound: sound() }), kind).toEqual({
        code: 'FRONT_NOT_ALLOWED',
        side: 'front',
      });
      expect(cardSoundProblem(kind, { backSound: sound() }), kind).toBeNull();
    }
    expect(
      cardSoundProblem('reversible', { frontSound: sound(), backSound: sound({ url: url('me-x.ogg') }) }),
    ).toBeNull();
  });
});

describe('addresses', () => {
  it('names the stored file, and rejects anything else', () => {
    expect(cardSoundFilename(url())).toBe('me-abc.webm');
    for (const bad of [
      '',
      '/api/study/card-sound/',
      url('a/b.webm'),
      url('..'),
      url('a b.webm'),
      '/api/feed/image/x.webp',
    ]) {
      expect(cardSoundFilename(bad), bad).toBeNull();
      expect(isCardSoundUrl(bad), bad).toBe(false);
    }
  });

  it('says whose a stored file is by the id it starts with', () => {
    expect(isCardSoundOwnedBy('me-abc.webm', 'me')).toBe(true);
    expect(isCardSoundOwnedBy('me-abc.webm', 'm')).toBe(false);
    expect(isCardSoundOwnedBy('me-abc.webm', '')).toBe(false);
  });
});

describe('columns', () => {
  it('round-trips, trimming the transcript, and reads no URL as no sound', () => {
    const columns = toSoundColumns({ backSound: sound({ transcript: '  hola  ' }) });
    expect(columns).toEqual({
      frontSoundUrl: null,
      frontSoundText: null,
      frontSoundMs: null,
      backSoundUrl: url(),
      backSoundText: 'hola',
      backSoundMs: 2000,
    });
    expect(fromSoundColumns(columns)).toEqual({ frontSound: null, backSound: sound() });
    expect(normalizeSounds({ frontSound: sound({ transcript: ' a ' }) }).frontSound?.transcript).toBe('a');
    expect(hasSounds(columns)).toBe(true);
    expect(hasSounds(toSoundColumns({}))).toBe(false);
    expect(soundUrls(columns)).toEqual([url()]);
  });
});

describe('what a generated card shows', () => {
  const source = toSoundColumns({
    frontSound: sound({ transcript: 'front' }),
    backSound: sound({ url: url('me-b.ogg'), transcript: 'back' }),
  });
  const sibling = (kind: string, clozeIndex: number | null) => ({ kind, sourceId: 'src', clozeIndex });

  it('an authored card shows its own', () => {
    expect(
      soundsOfRow({ kind: 'basic', sourceId: null, clozeIndex: null, ...source }, null).backSound?.transcript,
    ).toBe('back');
  });

  it('the reverse of a reversible card swaps the sides', () => {
    const shown = soundsOfRow(sibling('reversible', null), source);
    expect(shown.frontSound?.transcript).toBe('back');
    expect(shown.backSound?.transcript).toBe('front');
  });

  it('a cloze or occlusion sibling shows the back sound on its back and none on its front', () => {
    for (const kind of ['cloze', 'occlusion']) {
      const shown = soundsOfRow(sibling(kind, 2), source);
      expect(shown.frontSound, kind).toBeNull();
      expect(shown.backSound?.transcript, kind).toBe('back');
    }
  });
});

describe('soundFields', () => {
  const sounds = { frontSound: sound(), backSound: null };
  it('sends the sounds to the deck’s owner, only for a side that has one', () => {
    expect(soundFields(sounds, true)).toEqual({ frontSound: sound() });
    expect(soundFields({ frontSound: null, backSound: null }, true)).toEqual({});
  });
  it('sends nothing to anyone else', () => {
    expect(soundFields(sounds, false)).toEqual({});
  });
});

describe('formatSoundLength', () => {
  it('reads m:ss', () => {
    expect(formatSoundLength(0)).toBe('0:00');
    expect(formatSoundLength(7400)).toBe('0:07');
    expect(formatSoundLength(15_000)).toBe('0:15');
    expect(formatSoundLength(75_000)).toBe('1:15');
  });
});
