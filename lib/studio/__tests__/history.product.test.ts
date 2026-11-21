import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  COALESCE_MS,
  MAX_HISTORY_STEPS,
  canRedo,
  canUndo,
  commit,
  createHistory,
  depth,
  docEqual,
  flush,
  redo,
  selectDoc,
  undo,
  undoLabel,
  type DocSlice,
} from '@/lib/studio/history';
import { useStudioStore } from '@/lib/studio/store';
import { useJamStore } from '@/lib/studio/jam/store';
import type { Track } from '@/lib/studio/types';

const doc =
  (
    bpm: number,
  ): DocSlice => ({
    bpm,
    timeSignature:
      [
        4,
        4,
      ],
    tracks:
      [],
    clips:
      {},
    patterns:
      [],
    masterVolume: 1,
  });

function track(
  id: string,
): Track {
  return {
    id,
    name: id,
    type: 'midi',
    color:
      '#fff',
    volume: 1,
    pan: 0,
    muted: false,
    soloed: false,
    armed: false,
    clipIds:
      [],
    pluginChain:
      [],
    sends:
      [],
    height: 80,
  };
}

describe('history (pure)', () => {
  it('commits, undoes and redoes', () => {
    let h =
      commit(
        createHistory(),
        'tempo',
        doc(
          100,
        ),
        0,
        false,
      );
    expect(
      canUndo(
        h,
      ),
    ).toBe(
      true,
    );
    const u =
      undo(
        h,
        doc(
          120,
        ),
      )!;
    expect(
      u
        .doc
        .bpm,
    ).toBe(
      100,
    );
    expect(
      u.label,
    ).toBe(
      'tempo',
    );
    expect(
      canRedo(
        u.history,
      ),
    ).toBe(
      true,
    );
    const r =
      redo(
        u.history,
        doc(
          100,
        ),
      )!;
    expect(
      r
        .doc
        .bpm,
    ).toBe(
      120,
    );
    h =
      r.history;
    expect(
      canRedo(
        h,
      ),
    ).toBe(
      false,
    );
    expect(
      undo(
        createHistory(),
        doc(
          1,
        ),
      ),
    ).toBeNull();
  });

  it('a new commit clears redo', () => {
    let h =
      commit(
        createHistory(),
        'add-track',
        doc(
          1,
        ),
        0,
        false,
      );
    h =
      undo(
        h,
        doc(
          2,
        ),
      )!.history;
    expect(
      canRedo(
        h,
      ),
    ).toBe(
      true,
    );
    h =
      commit(
        h,
        'add-clip',
        doc(
          1,
        ),
        10,
        false,
      );
    expect(
      canRedo(
        h,
      ),
    ).toBe(
      false,
    );
  });

  it('keeps at most 100 steps, dropping the oldest', () => {
    let h =
      createHistory();
    for (
      let i = 0;
      i <
      MAX_HISTORY_STEPS +
        25;
      i++
    )
      h =
        commit(
          h,
          'add-track',
          doc(
            i,
          ),
          i,
          false,
        );
    expect(
      depth(
        h,
      ),
    ).toBe(
      MAX_HISTORY_STEPS,
    );
    expect(
      h
        .past[0]
        .doc
        .bpm,
    ).toBe(
      25,
    );
  });

  it('coalesces continuous changes within 400 ms into one step', () => {
    let h =
      createHistory();
    h =
      commit(
        h,
        'track-volume',
        doc(
          1,
        ),
        0,
        true,
      );
    h =
      commit(
        h,
        'track-volume',
        doc(
          2,
        ),
        100,
        true,
      );
    h =
      commit(
        h,
        'track-volume',
        doc(
          3,
        ),
        100 +
          COALESCE_MS,
        true,
      );
    expect(
      depth(
        h,
      ),
    ).toBe(
      1,
    );
    const u =
      undo(
        h,
        doc(
          4,
        ),
      )!;
    expect(
      u
        .doc
        .bpm,
    ).toBe(
      1,
    );
    expect(
      depth(
        u.history,
      ),
    ).toBe(
      0,
    );
  });

  it('does not coalesce after the window, across labels, or for discrete changes', () => {
    let h =
      commit(
        createHistory(),
        'track-volume',
        doc(
          1,
        ),
        0,
        true,
      );
    h =
      commit(
        h,
        'track-volume',
        doc(
          2,
        ),
        COALESCE_MS +
          1,
        true,
      );
    expect(
      depth(
        h,
      ),
    ).toBe(
      2,
    );
    h =
      commit(
        h,
        'track-pan',
        doc(
          3,
        ),
        COALESCE_MS +
          2,
        true,
      );
    expect(
      depth(
        h,
      ),
    ).toBe(
      3,
    );
    h =
      commit(
        h,
        'add-clip',
        doc(
          4,
        ),
        COALESCE_MS +
          3,
        false,
      );
    h =
      commit(
        h,
        'add-clip',
        doc(
          5,
        ),
        COALESCE_MS +
          4,
        false,
      );
    expect(
      depth(
        h,
      ),
    ).toBe(
      5,
    );
    expect(
      undoLabel(
        h,
      ),
    ).toBe(
      'add-clip',
    );
  });

  it('flush moves the pending gesture onto the stack so the next change is a new step', () => {
    let h =
      commit(
        createHistory(),
        'tempo',
        doc(
          1,
        ),
        0,
        true,
      );
    h =
      flush(
        h,
      );
    h =
      commit(
        h,
        'tempo',
        doc(
          2,
        ),
        10,
        true,
      );
    expect(
      depth(
        h,
      ),
    ).toBe(
      2,
    );
  });

  it('selectDoc covers the saved-project parts and docEqual compares by reference', () => {
    const a =
      doc(
        1,
      );
    expect(
      docEqual(
        a,
        selectDoc(
          {
            ...a,
          },
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      docEqual(
        a,
        {
          ...a,
          tracks:
            [],
        },
      ),
    ).toBe(
      false,
    );
    expect(
      Object.keys(
        selectDoc(
          a,
        ),
      ).sort(),
    ).toEqual(
      [
        'bpm',
        'clips',
        'masterVolume',
        'patterns',
        'timeSignature',
        'tracks',
      ],
    );
  });

  it('a 32-track project with 100 steps shares structure and stays small', () => {
    const tracks =
      Array.from(
        {
          length: 32,
        },
        (
          _,
          i,
        ) =>
          track(
            `t${i}`,
          ),
      );
    let state: DocSlice =
      {
        ...doc(
          120,
        ),
        tracks,
      };
    let h =
      createHistory();
    const before =
      process.memoryUsage()
        .heapUsed;
    for (
      let i = 0;
      i <
      MAX_HISTORY_STEPS;
      i++
    ) {
      h =
        commit(
          h,
          'track-mute',
          state,
          i *
            1000,
          false,
        );
      const idx =
        i %
        32;
      state =
        {
          ...state,
          tracks:
            state.tracks.map(
              (
                t,
                j,
              ) =>
                j ===
                idx
                  ? {
                      ...t,
                      muted:
                        !t.muted,
                    }
                  : t,
            ),
        };
    }
    const grown =
      process.memoryUsage()
        .heapUsed -
      before;
    expect(
      grown,
    ).toBeLessThan(
      20 *
        1024 *
        1024,
    );
    // Untouched tracks are shared between snapshots, not copied.
    expect(
      h
        .past[0]
        .doc
        .tracks[31],
    ).toBe(
      h
        .past[1]
        .doc
        .tracks[31],
    );
  });
});

describe('history in the store', () => {
  beforeEach(
    () => {
      vi.useFakeTimers();
      useJamStore
        .getState()
        .reset();
      useStudioStore
        .getState()
        .newProject();
    },
  );
  afterEach(
    () => {
      vi.useRealTimers();
      useJamStore
        .getState()
        .reset();
    },
  );

  it('records document changes and not view-only changes', () => {
    const s =
      useStudioStore.getState();
    s.setActiveView(
      'mixer',
    );
    s.setZoom(
      2,
      2,
    );
    s.setCurrentBeat(
      4,
    );
    s.setLoopEnabled(
      true,
    );
    s.selectClips(
      [],
    );
    expect(
      canUndo(
        useStudioStore.getState()
          .history,
      ),
    ).toBe(
      false,
    );
    s.addTrack(
      track(
        'a',
      ),
    );
    expect(
      useStudioStore.getState()
        .tracks,
    ).toHaveLength(
      1,
    );
    s.undo();
    expect(
      useStudioStore.getState()
        .tracks,
    ).toHaveLength(
      0,
    );
    s.redo();
    expect(
      useStudioStore.getState()
        .tracks,
    ).toHaveLength(
      1,
    );
  });

  it('a fader drag is one step', () => {
    const s =
      useStudioStore.getState();
    s.addTrack(
      track(
        'a',
      ),
    );
    s.flushHistory();
    for (const v of [
      0.9,
      0.7,
      0.5,
      0.25,
    ])
      useStudioStore
        .getState()
        .setTrackVolume(
          'a',
          v,
        );
    useStudioStore
      .getState()
      .flushHistory();
    expect(
      useStudioStore.getState()
        .tracks[0]
        .volume,
    ).toBe(
      0.25,
    );
    useStudioStore
      .getState()
      .undo();
    expect(
      useStudioStore.getState()
        .tracks[0]
        .volume,
    ).toBe(
      1,
    );
    expect(
      useStudioStore.getState()
        .tracks,
    ).toHaveLength(
      1,
    );
  });

  it('a held pointer keeps a paused drag as one step', async () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const target = Object.assign(new EventTarget(), { localStorage: storage });
    vi.stubGlobal('window', target);
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    const { useStudioStore: store } = await import('@/lib/studio/store');
    try {
      const s = store.getState();
      s.addTrack(track('a'));
      s.flushHistory();
      const before = store.getState().history.past.length;
      target.dispatchEvent(new Event('pointerdown'));
      s.setTrackVolume('a', 0.8);
      vi.advanceTimersByTime(COALESCE_MS * 3);
      s.setTrackVolume('a', 0.4);
      target.dispatchEvent(new Event('pointerup'));
      const h = store.getState().history;
      expect(h.past.length).toBe(before + 1);
      expect(h.pending).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('commits a quiet gesture after 400 ms by itself', () => {
    const s =
      useStudioStore.getState();
    s.addTrack(
      track(
        'a',
      ),
    );
    s.setTrackPan(
      'a',
      0.5,
    );
    expect(
      useStudioStore.getState()
        .history
        .pending,
    ).not.toBeNull();
    vi.advanceTimersByTime(
      COALESCE_MS +
        1,
    );
    expect(
      useStudioStore.getState()
        .history
        .pending,
    ).toBeNull();
  });

  it('undoing back to the saved state clears the dirty flag; redo sets it again', () => {
    const s =
      useStudioStore.getState();
    s.addTrack(
      track(
        'a',
      ),
    );
    s.markClean();
    expect(
      useStudioStore.getState()
        .projectDirty,
    ).toBe(
      false,
    );
    expect(
      canUndo(
        useStudioStore.getState()
          .history,
      ),
    ).toBe(
      true,
    );
    useStudioStore
      .getState()
      .setBpm(
        150,
      );
    useStudioStore
      .getState()
      .flushHistory();
    expect(
      useStudioStore.getState()
        .projectDirty,
    ).toBe(
      true,
    );
    useStudioStore
      .getState()
      .undo();
    expect(
      useStudioStore.getState()
        .bpm,
    ).toBe(
      120,
    );
    expect(
      useStudioStore.getState()
        .projectDirty,
    ).toBe(
      false,
    );
    useStudioStore
      .getState()
      .redo();
    expect(
      useStudioStore.getState()
        .projectDirty,
    ).toBe(
      true,
    );
    // Undoing past the saved state is dirty again.
    useStudioStore
      .getState()
      .undo();
    useStudioStore
      .getState()
      .undo();
    expect(
      useStudioStore.getState()
        .tracks,
    ).toHaveLength(
      0,
    );
    expect(
      useStudioStore.getState()
        .projectDirty,
    ).toBe(
      true,
    );
  });

  it('Delete track undo restores the track and its clips', () => {
    const s =
      useStudioStore.getState();
    s.addTrack(
      track(
        'a',
      ),
    );
    s.addClip(
      {
        id: 'c1',
        trackId:
          'a',
        type: 'midi',
        name: 'c',
        startBeat: 0,
        durationBeats: 4,
        color:
          '#fff',
        notes:
          [],
      },
    );
    s.removeTrack(
      'a',
    );
    expect(
      Object.keys(
        useStudioStore.getState()
          .clips,
      ),
    ).toHaveLength(
      0,
    );
    useStudioStore
      .getState()
      .undo();
    const st =
      useStudioStore.getState();
    expect(
      st.tracks.map(
        (
          t,
        ) =>
          t.id,
      ),
    ).toEqual(
      [
        'a',
      ],
    );
    expect(
      st
        .tracks[0]
        .clipIds,
    ).toEqual(
      [
        'c1',
      ],
    );
    expect(
      st
        .clips
        .c1,
    ).toBeDefined();
  });

  it('New and Open start with empty history', () => {
    const s =
      useStudioStore.getState();
    s.addTrack(
      track(
        'a',
      ),
    );
    s.setProject(
      'p',
      'P',
      [],
      {},
      [],
      100,
      [
        4,
        4,
      ],
      1,
    );
    expect(
      canUndo(
        useStudioStore.getState()
          .history,
      ),
    ).toBe(
      false,
    );
    useStudioStore
      .getState()
      .addTrack(
        track(
          'b',
        ),
      );
    useStudioStore
      .getState()
      .newProject();
    expect(
      canUndo(
        useStudioStore.getState()
          .history,
      ),
    ).toBe(
      false,
    );
  });
});
