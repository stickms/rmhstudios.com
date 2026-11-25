import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECK_LANGUAGE_TAGS,
  LISTEN_DELAYS,
  isDeckLanguageTag,
  isListenDelay,
  languageFor,
  readDeckLanguage,
  spokenFor,
  voiceReads,
  type ListenCard,
} from '@/lib/study/listen';
import { createListenController, type ListenDeps, type SideRequest } from '@/lib/study/listen-controller';
import { DEFAULT_CARD_LISTEN_PREFS, validateCardListenPrefs } from '@/lib/study/listen-prefs';

const card = (over: Partial<ListenCard>): ListenCard => ({
  kind: 'basic',
  front: 'hola',
  back: 'hello',
  clozeIndex: null,
  sourceId: null,
  ...over,
});

describe('what is spoken for each side', () => {
  it('a basic card says its front and its back', () => {
    expect(spokenFor(card({}), 'front', 'blank')).toEqual({ kind: 'text', text: 'hola' });
    expect(spokenFor(card({}), 'back', 'blank')).toEqual({ kind: 'text', text: 'hello' });
  });

  it('a reversible card says whichever side it is asked (the generated reverse already has them swapped)', () => {
    const reverse = card({ kind: 'reversible', front: 'hello', back: 'hola', sourceId: 'src' });
    expect(spokenFor(reverse, 'front', 'blank')).toEqual({ kind: 'text', text: 'hello' });
    expect(spokenFor(reverse, 'back', 'blank')).toEqual({ kind: 'text', text: 'hola' });
  });

  it('a cloze card says the blank word on the front and the whole sentence on the back', () => {
    const cloze = card({
      kind: 'cloze',
      front: 'The {{c1::capital}} of {{c2::France}} is {{c2::Paris}}.',
      back: '',
      clozeIndex: 2,
      sourceId: 'src',
    });
    expect(spokenFor(cloze, 'front', 'en blanco')).toEqual({
      kind: 'text',
      text: 'The capital of en blanco is en blanco.',
    });
    expect(spokenFor(cloze, 'back', 'en blanco')).toEqual({
      kind: 'text',
      text: 'The capital of France is Paris.',
    });
  });

  it('a cloze hint is not read in place of the blank word', () => {
    const cloze = card({ kind: 'cloze', front: 'It is {{c1::Paris::a city}}.', clozeIndex: 1, sourceId: 'src' });
    expect(spokenFor(cloze, 'front', 'blank')).toEqual({ kind: 'text', text: 'It is blank.' });
  });

  it('an occlusion card and a picture-only side are not spoken, and an empty side says nothing', () => {
    expect(spokenFor(card({ kind: 'occlusion', front: 'Label the heart' }), 'front', 'blank')).toEqual({
      kind: 'picture',
    });
    expect(spokenFor(card({ front: '  ', hasPicture: true }), 'front', 'blank')).toEqual({ kind: 'picture' });
    expect(spokenFor(card({ front: '', hasPicture: false }), 'front', 'blank')).toEqual({ kind: 'none' });
    // A side with words and a picture is spoken: the words are the card.
    expect(spokenFor(card({ hasPicture: true }), 'front', 'blank')).toEqual({ kind: 'text', text: 'hola' });
  });
});

describe('the language of a side', () => {
  const deck = { frontLang: 'es-ES', backLang: 'en-GB' };

  it('takes the deck’s language for the side, and the site’s when the deck names none', () => {
    expect(languageFor(card({}), 'front', deck, 'en')).toBe('es-ES');
    expect(languageFor(card({}), 'back', deck, 'en')).toBe('en-GB');
    expect(languageFor(card({}), 'front', { frontLang: null, backLang: 'en-GB' }, 'ar')).toBe('ar');
    expect(languageFor(card({}), 'back', { frontLang: 'es-ES', backLang: null }, 'ar')).toBe('ar');
    expect(languageFor(card({}), 'front', { frontLang: null, backLang: null }, 'de')).toBe('de');
  });

  it('a generated reverse card swaps the languages with the sides', () => {
    const reverse = card({ kind: 'reversible', sourceId: 'src' });
    expect(languageFor(reverse, 'front', deck, 'en')).toBe('en-GB');
    expect(languageFor(reverse, 'back', deck, 'en')).toBe('es-ES');
  });

  it('a cloze card is one sentence in the front language on both sides', () => {
    const cloze = card({ kind: 'cloze', sourceId: 'src', clozeIndex: 1 });
    expect(languageFor(cloze, 'front', deck, 'en')).toBe('es-ES');
    expect(languageFor(cloze, 'back', deck, 'en')).toBe('es-ES');
  });

  it('an unknown stored tag falls back to the site’s language', () => {
    expect(languageFor(card({}), 'front', { frontLang: 'tlh', backLang: null }, 'en')).toBe('en');
  });

  it('a saved voice reads a card only in its own base language', () => {
    expect(voiceReads('es-MX', 'es-ES')).toBe(true);
    expect(voiceReads('en_US', 'en-GB')).toBe(true);
    expect(voiceReads('en-US', 'es-ES')).toBe(false);
  });
});

describe('the lists', () => {
  it('holds the tags and the delays, with "Wait for me" as 0', () => {
    expect(new Set(DECK_LANGUAGE_TAGS).size).toBe(DECK_LANGUAGE_TAGS.length);
    expect(isDeckLanguageTag('es-MX')).toBe(true);
    expect(isDeckLanguageTag('es')).toBe(false);
    expect(readDeckLanguage('xx')).toBeNull();
    expect([...LISTEN_DELAYS]).toEqual([3, 5, 8, 0]);
    expect(isListenDelay(5)).toBe(true);
    expect(isListenDelay(4)).toBe(false);
  });

  it('the remembered choice reads back, and a corrupt one is the default (off, five seconds)', () => {
    expect(validateCardListenPrefs({ on: true, delay: 8 })).toEqual({ on: true, delay: 8 });
    for (const bad of [null, 'x', { on: 'yes', delay: 5 }, { on: true, delay: 4 }, { on: true }]) {
      expect(validateCardListenPrefs(bad)).toBeUndefined();
    }
    expect(DEFAULT_CARD_LISTEN_PREFS).toEqual({ on: false, delay: 5 });
  });
});

describe('the Listen sequence', () => {
  interface Spoke {
    text: string;
    lang: string;
    finish: () => void;
    silenced: boolean;
  }
  let spoke: Spoke[];
  let played: { url: string; finish: () => void; stopped: boolean }[];
  let revealed: number;
  let deps: ListenDeps;

  beforeEach(() => {
    vi.useFakeTimers();
    spoke = [];
    played = [];
    revealed = 0;
    deps = {
      speak: (text, lang, done) => {
        const s: Spoke = { text, lang, finish: done, silenced: false };
        spoke.push(s);
        return () => {
          s.silenced = true;
        };
      },
      playSound: (url, done) => {
        const p = { url, finish: done, stopped: false };
        played.push(p);
        return () => {
          p.stopped = true;
        };
      },
      later: (run, ms) => {
        const id = setTimeout(run, ms);
        return () => clearTimeout(id);
      },
      reveal: () => {
        revealed++;
      },
    };
  });
  afterEach(() => vi.useRealTimers());

  const front = (over: Partial<SideRequest> = {}): SideRequest => ({
    spoken: { kind: 'text', text: 'hola' },
    lang: 'es-ES',
    revealAfter: 5,
    ...over,
  });

  it('says the front in its language, then shows the answer five seconds after it ends', () => {
    const controller = createListenController(deps);
    expect(controller.play(front())).toBe('spoken');
    expect(spoke).toMatchObject([{ text: 'hola', lang: 'es-ES' }]);
    // Nothing is shown while the voice is still talking, however long that takes.
    vi.advanceTimersByTime(60_000);
    expect(revealed).toBe(0);
    spoke[0]!.finish();
    vi.advanceTimersByTime(4_999);
    expect(revealed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(revealed).toBe(1);
  });

  it('"Wait for me" never shows the answer by itself, and neither does the back', () => {
    const controller = createListenController(deps);
    controller.play(front({ revealAfter: undefined }));
    spoke[0]!.finish();
    controller.play({ spoken: { kind: 'text', text: 'hello' }, lang: 'en-GB' });
    spoke[1]!.finish();
    vi.advanceTimersByTime(600_000);
    expect(revealed).toBe(0);
  });

  it('a card’s own recording is played instead of speech', () => {
    const controller = createListenController(deps);
    expect(controller.play(front({ soundUrl: '/api/study/card-sound/own.webm' }))).toBe('sound');
    expect(spoke).toHaveLength(0);
    played[0]!.finish();
    vi.advanceTimersByTime(5_000);
    expect(revealed).toBe(1);
  });

  it('a picture or an empty side says nothing and leaves the session waiting', () => {
    const controller = createListenController(deps);
    expect(controller.play(front({ spoken: { kind: 'picture' } }))).toBe('picture');
    expect(controller.play(front({ spoken: { kind: 'none' } }))).toBe('none');
    vi.advanceTimersByTime(600_000);
    expect(spoke).toHaveLength(0);
    expect(revealed).toBe(0);
  });

  it('playing again silences a side still talking', () => {
    const controller = createListenController(deps);
    controller.play(front());
    controller.play(front());
    expect(spoke[0]!.silenced).toBe(true);
    controller.stop();
    expect(spoke[1]!.silenced).toBe(true);
  });

  it('playing again or stopping cancels a reveal that was waiting', () => {
    const controller = createListenController(deps);
    controller.play(front());
    spoke[0]!.finish();
    vi.advanceTimersByTime(3_000);
    controller.play(front());
    // The first side's timer is gone: only the replay's own, started when it ends, can reveal.
    vi.advanceTimersByTime(10_000);
    expect(revealed).toBe(0);
    spoke[1]!.finish();
    vi.advanceTimersByTime(3_000);
    controller.stop();
    vi.advanceTimersByTime(10_000);
    expect(revealed).toBe(0);
  });

  it('a side that ends after it was replaced does nothing', () => {
    const controller = createListenController(deps);
    controller.play(front());
    const stale = spoke[0]!;
    controller.play(front());
    stale.finish();
    vi.advanceTimersByTime(10_000);
    expect(revealed).toBe(0);
  });
});
