/**
 * The one player for flashcard sounds (s10-02), client only. Nothing is created until a play button is pressed: no
 * `Audio` element exists at rest, and review preloads nothing. One sound plays at a time (starting another stops
 * the first), and a sound stops at 15 seconds whatever its file says, so a client that lied about the length when
 * it uploaded gains nothing.
 */
import { CARD_SOUND_MAX_MS } from '@/lib/study/card-sound';

type Listener = () => void;

let audio: HTMLAudioElement | null = null;
let playing: string | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  for (const listener of listeners) listener();
};

/** For `useSyncExternalStore`. */
export function subscribeCardSound(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The address of the sound playing now, or null. */
export const playingCardSound = (): string | null => playing;

/** Stop whatever is playing and let the element go. */
export function stopCardSound(): void {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio = null;
  }
  if (playing !== null) {
    playing = null;
    emit();
  }
}

/**
 * Play `url`, or stop it when it is the sound playing now. Resolves false when the browser refused to play it
 * (the caller says so), true otherwise.
 */
export async function toggleCardSound(url: string): Promise<boolean> {
  if (playing === url) {
    stopCardSound();
    return true;
  }
  stopCardSound();
  if (typeof Audio === 'undefined') return false;
  const el = new Audio(url);
  audio = el;
  playing = url;
  emit();
  el.addEventListener('ended', () => {
    if (audio === el) stopCardSound();
  });
  el.addEventListener('timeupdate', () => {
    if (audio === el && el.currentTime * 1000 >= CARD_SOUND_MAX_MS) stopCardSound();
  });
  el.addEventListener('error', () => {
    if (audio === el) stopCardSound();
  });
  try {
    await el.play();
    return true;
  } catch {
    if (audio === el) stopCardSound();
    return false;
  }
}
