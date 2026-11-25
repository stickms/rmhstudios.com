import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { createReader, speechSupported } from '@/lib/audio/read-aloud';
import { readListenPrefs, writeListenPrefs } from '@/lib/reading/listen-prefs';
import { playingCardSound, stopCardSound, subscribeCardSound, toggleCardSound } from '@/lib/study/card-sound-player';
import type { CardKind } from '@/lib/study/card-types';
import { createListenController, type ListenController, type SideRequest } from '@/lib/study/listen-controller';
import {
  languageFor,
  spokenFor,
  voiceReads,
  type DeckLanguages,
  type ListenDelay,
  type ListenSide,
} from '@/lib/study/listen';
import { DEFAULT_CARD_LISTEN_PREFS, readCardListenPrefs, writeCardListenPrefs } from '@/lib/study/listen-prefs';

/** The parts of a review card Listen reads (the queue's card and a deck page's card both have them). */
export interface ListenableCard {
  id: string;
  kind: CardKind;
  front: string;
  back: string;
  clozeIndex: number | null;
  sourceId: string | null;
  frontImage?: unknown;
  backImage?: unknown;
  frontSound?: { url: string } | undefined | null;
  backSound?: { url: string } | undefined | null;
}

export interface CardListen {
  /** The browser can speak at all; without it the switch is off and says why. */
  supported: boolean;
  on: boolean;
  delay: ListenDelay;
  rate: number;
  /** The side showing has a picture and no words: nothing is said and the session waits for the member. */
  pictureOnly: boolean;
  setOn: (on: boolean) => void;
  setDelay: (delay: ListenDelay) => void;
  setRate: (rate: number) => void;
  /** Say the side showing again. */
  replay: () => void;
}

const noop = () => {};
const subscribeNever = () => noop;

/** A saved voice is used only for a language it reads; otherwise the browser's own match for the side's language. */
function voiceFor(voiceURI: string | null, lang: string): string | null {
  if (!voiceURI || typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
  return voice && voiceReads(voice.lang, lang) ? voiceURI : null;
}

/**
 * Listen mode for a review session (s11-17). With it on, the front is said when a card appears, the answer is shown
 * after the member's delay and said in its own language, and the member grades with the usual buttons or keys. It
 * never grades. Off, the hook starts nothing: no reader, no timer, no listener.
 */
export function useCardListen({
  card,
  deck,
  revealed,
  onReveal,
}: {
  card: ListenableCard | null;
  deck: DeckLanguages;
  revealed: boolean;
  onReveal: () => void;
}): CardListen {
  const { t } = useTranslation('card-listen');
  const blank = t('blank', {
    defaultValue: 'blank',
  });
  const supported = useSyncExternalStore(subscribeNever, speechSupported, () => false);
  // The device's choice is read after mount, so the server's markup and the first client render agree.
  const [prefs, setPrefs] = useState(DEFAULT_CARD_LISTEN_PREFS);
  const [rate, setRateState] = useState(1);
  useEffect(() => {
    setPrefs(readCardListenPrefs());
    setRateState(readListenPrefs().rate);
  }, []);
  const on = prefs.on && supported;

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const revealRef = useRef(onReveal);
  revealRef.current = onReveal;
  const controllerRef = useRef<ListenController | null>(null);
  const requestRef = useRef<() => SideRequest | null>(() => null);

  const side: ListenSide = revealed ? 'back' : 'front';
  const hasPicture = card ? !!(side === 'front' ? card.frontImage : card.backImage) : false;
  const pictureOnly = !!card && spokenFor({ ...card, hasPicture }, side, blank).kind === 'picture';

  requestRef.current = () => {
    if (!card) return null;
    const siteLanguage = document.documentElement.lang || 'en';
    const sound = side === 'front' ? card.frontSound : card.backSound;
    return {
      spoken: spokenFor({ ...card, hasPicture }, side, blank),
      lang: languageFor(card, side, deck, siteLanguage),
      soundUrl: sound?.url,
      // Only the front waits and then shows the answer; "Wait for me" (0) leaves it to the member.
      revealAfter: side === 'front' && prefs.delay > 0 ? prefs.delay : undefined,
    };
  };

  useEffect(() => {
    if (!on || !card) return;
    const controller = createListenController({
      speak: (text, lang, done) => {
        const reader = createReader([text], {
          lang,
          rate: rateRef.current,
          voiceURI: voiceFor(readListenPrefs().voiceURI, lang),
          onStateChange: (state) => {
            if (state === 'ended' || state === 'idle') done();
          },
        });
        if (!reader) {
          done();
          return noop;
        }
        reader.play(0);
        return () => reader.destroy();
      },
      playSound: (url, done) => {
        let finished = false;
        // Whatever was playing is stopped first, so its stop is not mistaken for this sound ending.
        stopCardSound();
        const unsubscribe = subscribeCardSound(() => {
          if (finished || playingCardSound() === url) return;
          finished = true;
          unsubscribe();
          done();
        });
        void toggleCardSound(url).then((played) => {
          if (played || finished) return;
          finished = true;
          unsubscribe();
          done();
        });
        return () => {
          finished = true;
          unsubscribe();
          if (playingCardSound() === url) stopCardSound();
        };
      },
      // A one-shot timer: Listen has no frame loop and no interval.
      later: (run, ms) => {
        const id = setTimeout(run, ms);
        return () => clearTimeout(id);
      },
      reveal: () => revealRef.current(),
    });
    controllerRef.current = controller;
    const request = requestRef.current();
    if (request) controller.play(request);
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
    // The card, the side showing and the choices below are the whole of what a new sequence depends on.
  }, [on, card, revealed, prefs.delay, deck.frontLang, deck.backLang, blank]);

  const replay = useCallback(() => {
    const request = requestRef.current();
    if (request) controllerRef.current?.play(request);
  }, []);

  return {
    supported,
    on,
    delay: prefs.delay,
    rate,
    pictureOnly: on && pictureOnly,
    setOn: (next) => {
      const value = { ...prefs, on: next };
      setPrefs(value);
      writeCardListenPrefs(value);
    },
    setDelay: (delay) => {
      const value = { ...prefs, delay };
      setPrefs(value);
      writeCardListenPrefs(value);
    },
    setRate: (next) => {
      setRateState(next);
      writeListenPrefs({ ...readListenPrefs(), rate: next });
    },
    replay,
  };
}
