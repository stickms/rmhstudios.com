// =============================================================================
// ALTAIR -- Music Manager
// =============================================================================
// Shuffled background music playback using Howler.js. Plays through all tracks
// in random order, then reshuffles. Reads volume from the settings store.
// =============================================================================

import { Howl } from 'howler';
import { useAltairSettingsStore } from '../stores/settings-store';
import { asset } from '@/lib/storage/asset';

const TRACKS = [
  asset('/music/altair/1.mp3'),
  asset('/music/altair/2.mp3'),
  asset('/music/altair/3.mp3'),
  asset('/music/altair/4.mp3'),
];

let currentHowl: Howl | null = null;
let shuffleQueue: number[] = [];
let lastPlayed = -1;
let started = false;

/** Fisher-Yates shuffle, avoiding immediate repeat of last played track. */
function buildShuffleQueue(): void {
  shuffleQueue = TRACKS.map((_, i) => i);
  for (let i = shuffleQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffleQueue[i], shuffleQueue[j]] = [shuffleQueue[j], shuffleQueue[i]];
  }
  if (shuffleQueue[0] === lastPlayed && shuffleQueue.length > 1) {
    [shuffleQueue[0], shuffleQueue[1]] = [shuffleQueue[1], shuffleQueue[0]];
  }
}

function getEffectiveVolume(): number {
  const { masterVolume, musicVolume } = useAltairSettingsStore.getState();
  return masterVolume * musicVolume;
}

function playNext(): void {
  if (shuffleQueue.length === 0) buildShuffleQueue();
  const trackIndex = shuffleQueue.shift()!;
  lastPlayed = trackIndex;

  if (currentHowl) {
    currentHowl.stop();
    currentHowl.unload();
    currentHowl = null;
  }

  // Use WebAudio (html5: false) so volume control works on iOS/mobile.
  // html5: true disables JavaScript volume control on iOS.
  currentHowl = new Howl({
    src: [TRACKS[trackIndex]],
    volume: getEffectiveVolume(),
    html5: false,
    preload: true,
    onend: () => {
      if (started) playNext();
    },
    onplayerror: () => {
      currentHowl?.once('unlock', () => currentHowl?.play());
    },
  });
  currentHowl.play();
}

export const altairMusic = {
  /** Begin shuffled playback. Safe to call multiple times. */
  start(): void {
    if (started) return;
    started = true;
    playNext();
  },

  /** Stop playback and clean up. */
  stop(): void {
    started = false;
    if (currentHowl) {
      currentHowl.stop();
      currentHowl.unload();
      currentHowl = null;
    }
  },

  /** Update the current track's volume (call when settings change). */
  updateVolume(): void {
    if (currentHowl) {
      currentHowl.volume(getEffectiveVolume());
    }
  },

  /** Whether music is currently active. */
  isPlaying(): boolean {
    return started && currentHowl !== null;
  },
};
