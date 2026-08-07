/**
 * Playtest: the real engine on the edited chart, and the run that cannot score.
 *
 * `docs/slice-it-chart-editor.md` §10. Two things are worth a test here and the
 * rest is UI:
 *
 *  1. **A run started in the editor is structurally unable to submit.** Not
 *     "the button is hidden" — there is no path from a `PlaytestSession` to a
 *     `RunSummary`, and the map it plays is branded so anything that does get
 *     hold of one is rejected at the boundary.
 *  2. **It is the same engine.** The session drives `GameEngine`, and hit
 *     highlights come back off the engine's own `hit`/`hitTime` fields rather
 *     than a parallel channel that could disagree with what was judged.
 *
 * The engine is driven against a stubbed AudioManager, the pattern
 * `lib/slice-it/__tests__/engine-timing.test.ts` established: the interesting
 * surface is the accounting, not Web Audio.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const clock = { time: 0 };

vi.mock('@/lib/audio/AudioManager', () => {
  const instance = {
    pauseTime: 0,
    getCurrentTime: () => clock.time,
    getDuration: () => 300,
    setPlaybackRate: () => {},
    loadFromBuffer: () => {},
    loadTrack: async () => undefined,
    play: () => {},
    pause: () => {},
    stop: () => {},
    playSfX: () => {},
    playHitSoundFile: () => {},
    preloadHitSound: async () => {},
    getContext: () => null,
  };
  return { AudioManager: { getInstance: () => instance } };
});

vi.mock('@/lib/slice-it/net/client', () => ({
  reportScore: () => {},
  reportFinish: () => {},
  reportLoaded: () => {},
}));

import { useSliceItStore } from '@/lib/slice-it/store';
import {
  assertSubmittable,
  buildPlaytestMap,
  editorMapId,
  isEditorMapId,
  PlaytestForbiddenError,
  PlaytestSession,
  activePlaytest,
  EDITOR_MAP_PREFIX,
} from '../playtest';
import type { EditorNote } from '../types';

const SONG = {
  id: 'song-123',
  title: 'Test Track',
  artist: 'Nobody',
  audioUrl: 'https://example.invalid/track.mp3',
  bpm: 120,
};

/** Two notes, one per lane, with editor state on them that must not travel. */
function notes(): EditorNote[] {
  return [
    { id: 'note-a', time: 1, lane: 0, type: 'STANDARD', auto: true, selected: true },
    { id: 'note-b', time: 1.5, lane: 1, type: 'STANDARD', auto: false },
  ];
}

beforeEach(() => {
  clock.time = 0;
  activePlaytest()?.stop();
});

describe('an editor run cannot submit', () => {
  it('brands the map it plays', () => {
    const map = buildPlaytestMap(SONG, notes());
    expect(map.id).toBe(editorMapId(SONG.id));
    expect(map.id.startsWith(EDITOR_MAP_PREFIX)).toBe(true);
    expect(isEditorMapId(map.id)).toBe(true);
    expect(isEditorMapId(SONG.id)).toBe(false);
  });

  it('throws at the boundary rather than returning a boolean nobody checks', () => {
    expect(() => assertSubmittable(buildPlaytestMap(SONG, notes()).id)).toThrow(
      PlaytestForbiddenError,
    );
    // A real run is unaffected: the guard is not a blanket refusal.
    expect(() => assertSubmittable(SONG.id)).not.toThrow();
    expect(() => assertSubmittable(null)).not.toThrow();
  });

  it('exposes no way to build a RunSummary from a session', async () => {
    const session = await PlaytestSession.start({ song: SONG, notes: notes(), from: 0 });
    expect(() => session.runSummary()).toThrow(PlaytestForbiddenError);

    // The fields `useSubmitScore` needs are not reachable from the session: the
    // engine is private, and nothing proxies its score out.
    for (const field of ['score', 'accuracy', 'maxCombo', 'runToken', 'engine', 'getState']) {
      expect((session as unknown as Record<string, unknown>)[field]).toBeUndefined();
    }
    session.stop();
  });

  it('drops the editor-only fields before the engine ever sees a note', () => {
    const map = buildPlaytestMap(SONG, notes());
    const slices = map.slices as { id: string }[];
    for (const slice of slices) {
      expect(slice).not.toHaveProperty('auto');
      expect(slice).not.toHaveProperty('selected');
    }
    expect(slices.map((slice) => slice.id)).toEqual(['note-a', 'note-b']);
  });
});

describe('the session drives the real engine', () => {
  it('judges a press against the edited chart and reports it as a hit highlight', async () => {
    const session = await PlaytestSession.start({ song: SONG, notes: notes(), from: 0.5 });
    expect(activePlaytest()).toBe(session);

    clock.time = 1;
    session.tick();
    session.press(0);
    session.tick();

    const mark = session.hitOf('note-a');
    expect(mark).toBeDefined();
    expect(mark?.hit).toBe(true);

    // The note nobody pressed is swept as a miss once its window has passed —
    // read off the same `hit`/`hitTime` pair, so the timeline cannot disagree
    // with the judgement.
    clock.time = 3;
    session.tick();
    expect(session.hitOf('note-b')).toEqual({ hit: false, at: expect.any(Number) });

    session.stop();
  });

  it('stops where the audio stopped, and hands the game store back', async () => {
    const store = useSliceItStore.getState();
    store.setStatus('MENU');
    const before = useSliceItStore.getState().modifiers;

    const session = await PlaytestSession.start({ song: SONG, notes: notes(), from: 0.5 });
    expect(useSliceItStore.getState().status).toBe('PLAYING');

    clock.time = 2.25;
    session.tick();
    // §10: "Stopping a playtest puts the playhead where the audio stopped, not
    // back where it started."
    expect(session.stop()).toBeCloseTo(2.25, 5);
    expect(session.from).toBe(0.5);

    expect(useSliceItStore.getState().status).toBe('MENU');
    expect(useSliceItStore.getState().modifiers).toEqual(before);
    expect(activePlaytest()).toBeNull();
  });

  it('only one playtest runs at a time', async () => {
    const first = await PlaytestSession.start({ song: SONG, notes: notes(), from: 0 });
    const second = await PlaytestSession.start({ song: SONG, notes: notes(), from: 4 });
    expect(first.running).toBe(false);
    expect(activePlaytest()).toBe(second);
    second.stop();
  });
});
