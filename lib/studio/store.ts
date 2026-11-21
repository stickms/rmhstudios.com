import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Track,
  Clip,
  Pattern,
  ViewMode,
  ToolMode,
  StudioSettings,
  ProjectMeta,
  KeybindMap,
} from './types';
import {
  DEFAULT_SETTINGS,
  DEFAULT_BPM,
  DEFAULT_TIME_SIGNATURE,
  TRACK_COLORS,
  DEFAULT_TRACK_HEIGHT,
} from './constants';
import {
  COALESCE_MS,
  commit,
  createHistory,
  docEqual,
  flush,
  redo as redoStep,
  selectDoc,
  undo as undoStep,
  type DocSlice,
  type History,
  type HistoryLabel,
} from './history';
import { useJamStore } from './jam/store';

// ─── Store Interface ────────────────────────────────────────────────────────

export interface StudioStore {
  // === Project ===
  projectId:
    | string
    | null;
  projectName: string;
  projectDirty: boolean;

  // === Transport ===
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  timeSignature: [
    number,
    number,
  ];
  currentBeat: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;

  // === Tracks ===
  tracks: Track[];
  selectedTrackId:
    | string
    | null;

  // === Clips ===
  clips: Record<
    string,
    Clip
  >;
  selectedClipIds: string[];
  /** Notes selected in the piano roll (selection is view state, not history). */
  selectedNoteIds: string[];

  // === Patterns ===
  patterns: Pattern[];

  // === Mixer ===
  masterVolume: number;

  // === UI ===
  activeView: ViewMode;
  selectedTool: ToolMode;
  snapEnabled: boolean;
  snapValue: number;
  zoomX: number;
  zoomY: number;
  scrollX: number;
  scrollY: number;
  openPluginWindows: string[];
  sampleBrowserOpen: boolean;
  pianoRollClipId:
    | string
    | null;
  pianoRollNoteLength: number;

  // === Keybinds ===
  typingKeyboardEnabled: boolean;
  typingKeyboardOctave: number;

  // === Settings (persisted) ===
  settings: StudioSettings;

  // === Actions: Transport ===
  setIsPlaying: (
    playing: boolean,
  ) => void;
  setIsRecording: (
    recording: boolean,
  ) => void;
  setBpm: (
    bpm: number,
  ) => void;
  setTimeSignature: (
    ts: [
      number,
      number,
    ],
  ) => void;
  setCurrentBeat: (
    beat: number,
  ) => void;
  setLoopEnabled: (
    enabled: boolean,
  ) => void;
  setLoopPoints: (
    start: number,
    end: number,
  ) => void;
  setMetronomeEnabled: (
    enabled: boolean,
  ) => void;

  // === Actions: Tracks ===
  addTrack: (
    track: Track,
  ) => void;
  removeTrack: (
    trackId: string,
  ) => void;
  updateTrack: (
    trackId: string,
    updates: Partial<Track>,
  ) => void;
  selectTrack: (
    trackId:
      | string
      | null,
  ) => void;
  reorderTracks: (
    fromIndex: number,
    toIndex: number,
  ) => void;

  // === Actions: Clips ===
  addClip: (
    clip: Clip,
  ) => void;
  removeClip: (
    clipId: string,
  ) => void;
  updateClip: (
    clipId: string,
    updates: Partial<Clip>,
  ) => void;
  selectClips: (
    clipIds: string[],
  ) => void;
  selectNotes: (noteIds: string[]) => void;

  // === Actions: Patterns ===
  addPattern: (
    pattern: Pattern,
  ) => void;
  removePattern: (
    patternId: string,
  ) => void;
  updatePattern: (
    patternId: string,
    updates: Partial<Pattern>,
  ) => void;

  // === Actions: Mixer ===
  setMasterVolume: (
    volume: number,
  ) => void;
  setTrackVolume: (
    trackId: string,
    volume: number,
  ) => void;
  setTrackPan: (
    trackId: string,
    pan: number,
  ) => void;
  toggleTrackMute: (
    trackId: string,
  ) => void;
  toggleTrackSolo: (
    trackId: string,
  ) => void;
  toggleTrackArm: (
    trackId: string,
  ) => void;

  // === Actions: UI ===
  setActiveView: (
    view: ViewMode,
  ) => void;
  setSelectedTool: (
    tool: ToolMode,
  ) => void;
  setSnapEnabled: (
    enabled: boolean,
  ) => void;
  setSnapValue: (
    value: number,
  ) => void;
  setZoom: (
    x: number,
    y: number,
  ) => void;
  setScroll: (
    x: number,
    y: number,
  ) => void;
  toggleSampleBrowser: () => void;
  openPluginWindow: (
    pluginInstanceId: string,
  ) => void;
  closePluginWindow: (
    pluginInstanceId: string,
  ) => void;
  setPianoRollClip: (
    clipId:
      | string
      | null,
  ) => void;
  setPianoRollNoteLength: (
    beats: number,
  ) => void;

  // === Actions: Keybinds ===
  setTypingKeyboardEnabled: (
    enabled: boolean,
  ) => void;
  setTypingKeyboardOctave: (
    octave: number,
  ) => void;

  // === Actions: Settings ===
  updateSettings: (
    partial: Partial<StudioSettings>,
  ) => void;
  setKeybindOverride: (
    actionId: string,
    keys: string[],
  ) => void;
  resetKeybinds: () => void;

  // === Actions: Project ===
  setProject: (
    id: string,
    name: string,
    tracks: Track[],
    clips: Record<
      string,
      Clip
    >,
    patterns: Pattern[],
    bpm: number,
    ts: [
      number,
      number,
    ],
    masterVolume: number,
  ) => void;
  markDirty: () => void;
  markClean: () => void;
  newProject: () => void;
  /** Name (and, on first save or Save as, id) the open project, without touching its content. */
  setProjectIdentity: (
    id: string | null,
    name: string,
  ) => void;

  // === History (lib/studio/history.ts) ===
  history: History;
  /** The latest undo or redo, for the polite live region; `seq` changes on every move. */
  lastHistoryMove: { kind: 'undo' | 'redo'; label: HistoryLabel; seq: number } | null;
  undo: () => void;
  redo: () => void;
  /** Run several mutators as ONE history step. */
  runStep: (label: HistoryLabel, fn: () => void) => void;
  /** Commit a gesture still collecting changes (pointer released). */
  flushHistory: () => void;
  clearHistory: () => void;
}

// ─── History plumbing ───────────────────────────────────────────────────────

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pointerHeld = false;
let stepDepth = 0;
/** The document as last saved or loaded; undoing back to it clears the dirty flag. */
let savedDoc: DocSlice | null = null;
const clearFlushTimer = () => {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
};
/** History is off while a jam is connected: remote edits go through the same store. */
const historyActive = () => useJamStore.getState().status === 'off';

function clipUpdateLabel(updates: Partial<Clip>): HistoryLabel {
  const keys = Object.keys(updates);
  if ('notes' in updates) return 'edit-notes';
  if (keys.length > 0 && keys.every((k) => k === 'startBeat' || k === 'trackId')) return 'move-clip';
  return 'edit-clip';
}

// ─── Store Creation ─────────────────────────────────────────────────────────

let nextTrackColorIdx = 0;
function getNextTrackColor(): string {
  const color =
    TRACK_COLORS[
      nextTrackColorIdx %
        TRACK_COLORS.length
    ];
  nextTrackColorIdx++;
  return color;
}

export const useStudioStore =
  create<StudioStore>()(
    persist(
      (
        set,
        get,
      ) => {

        const mutate = (
          label: HistoryLabel,
          coalesce: boolean,
          fn: (s: StudioStore) => Partial<StudioStore> | StudioStore,
        ) => {
          const prev = get();
          const patch = fn(prev);
          if (patch === prev) return;
          const before = selectDoc(prev);
          if (docEqual(before, selectDoc({ ...prev, ...patch }))) {
            set(patch);
            return;
          }
          const record = stepDepth === 0 && historyActive();
          // A held pointer is one gesture however long it pauses, so it keeps joining the pending step.
          const pending = prev.history.pending;
          const now = pointerHeld && pending ? pending.lastAt : Date.now();
          const history = record ? commit(prev.history, label, before, now, coalesce) : prev.history;
          set({ ...patch, history, projectDirty: true });
          if (record && history.pending) scheduleFlush();
        };
        const trackPatch = (s: StudioStore, trackId: string, updates: Partial<Track>) => ({
          tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
        });
        const flushNow = () => {
          clearFlushTimer();
          const h = get().history;
          if (h.pending) set({ history: flush(h) });
        };
        const scheduleFlush = () => {
          clearFlushTimer();
          flushTimer = setTimeout(() => {
            flushTimer = null;
            // A held pointer is a gesture still going; its pointerup flushes.
            if (pointerHeld) scheduleFlush();
            else flushNow();
          }, COALESCE_MS);
        };
        const travel = (dir: 'undo' | 'redo') => {
          if (!historyActive()) return;
          clearFlushTimer();
          const s = get();
          const move = (dir === 'undo' ? undoStep : redoStep)(s.history, selectDoc(s));
          if (!move) return;
          const doc = move.doc;
          const clipExists = (id: string) => id in doc.clips;
          set({
            ...doc,
            history: move.history,
            projectDirty: !savedDoc || !docEqual(doc, savedDoc),
            selectedClipIds: s.selectedClipIds.filter(clipExists),
            selectedTrackId: doc.tracks.some((t) => t.id === s.selectedTrackId) ? s.selectedTrackId : null,
            selectedNoteIds: [],
            pianoRollClipId: s.pianoRollClipId && clipExists(s.pianoRollClipId) ? s.pianoRollClipId : null,
            lastHistoryMove: { kind: dir, label: move.label, seq: (s.lastHistoryMove?.seq ?? 0) + 1 },
          });
        };

        return {
        // === Initial State ===
        projectId:
          null,
        projectName:
          'Untitled Project',
        projectDirty: false,

        isPlaying: false,
        isRecording: false,
        bpm: DEFAULT_BPM,
        timeSignature:
          DEFAULT_TIME_SIGNATURE,
        currentBeat: 0,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 16,
        metronomeEnabled: false,

        tracks:
          [],
        selectedTrackId:
          null,

        clips:
          {},
        selectedClipIds:
          [],
        selectedNoteIds: [],

        patterns:
          [],

        masterVolume: 1,

        activeView:
          'arrangement',
        selectedTool:
          'select',
        snapEnabled: true,
        snapValue: 0.25,
        zoomX: 1,
        zoomY: 1,
        scrollX: 0,
        scrollY: 0,
        openPluginWindows:
          [],
        sampleBrowserOpen: false,
        pianoRollClipId:
          null,
        pianoRollNoteLength: 0.25,

        typingKeyboardEnabled: false,
        typingKeyboardOctave: 3,

        settings:
          DEFAULT_SETTINGS,

        // === Transport Actions ===
        setIsPlaying:
          (
            playing,
          ) =>
            set(
              {
                isPlaying:
                  playing,
              },
            ),
        setIsRecording:
          (
            recording,
          ) =>
            set(
              {
                isRecording:
                  recording,
              },
            ),
        setBpm: (bpm) =>
          mutate('tempo', true, () => ({ bpm })),
        setTimeSignature: (ts) =>
          mutate('time-signature', false, () => ({ timeSignature: ts })),
        setCurrentBeat:
          (
            beat,
          ) =>
            set(
              {
                currentBeat:
                  beat,
              },
            ),
        setLoopEnabled:
          (
            enabled,
          ) =>
            set(
              {
                loopEnabled:
                  enabled,
              },
            ),
        setLoopPoints:
          (
            start,
            end,
          ) =>
            set(
              {
                loopStart:
                  start,
                loopEnd:
                  end,
              },
            ),
        setMetronomeEnabled:
          (
            enabled,
          ) =>
            set(
              {
                metronomeEnabled:
                  enabled,
              },
            ),

        // === Track Actions ===
        addTrack: (track) =>
          mutate('add-track', false, (s) => ({
            tracks: [...s.tracks, track],
            selectedTrackId: track.id,
          })),
        removeTrack: (trackId) =>
          mutate('delete-track', false, (s) => {
            const clips = { ...s.clips };
            const track = s.tracks.find((t) => t.id === trackId);
            if (track) {
              for (const clipId of track.clipIds) delete clips[clipId];
            }
            return {
              tracks: s.tracks.filter((t) => t.id !== trackId),
              clips,
              selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
            };
          }),
        updateTrack: (trackId, updates) =>
          mutate('edit-track', true, (s) => ({
            tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
          })),
        selectTrack: (trackId) => set({ selectedTrackId: trackId }),
        reorderTracks: (fromIndex, toIndex) =>
          mutate('reorder-tracks', false, (s) => {
            const tracks = [...s.tracks];
            const [moved] = tracks.splice(fromIndex, 1);
            tracks.splice(toIndex, 0, moved);
            return { tracks };
          }),

        // === Clip Actions ===
        addClip: (clip) =>
          mutate('add-clip', false, (s) => ({
            clips: { ...s.clips, [clip.id]: clip },
            tracks: s.tracks.map((t) =>
              t.id === clip.trackId ? { ...t, clipIds: [...t.clipIds, clip.id] } : t,
            ),
          })),
        removeClip: (clipId) =>
          mutate('delete-clip', false, (s) => {
            const clip = s.clips[clipId];
            if (!clip) return s;
            const clips = { ...s.clips };
            delete clips[clipId];
            return {
              clips,
              tracks: s.tracks.map((t) =>
                t.id === clip.trackId
                  ? { ...t, clipIds: t.clipIds.filter((id) => id !== clipId) }
                  : t,
              ),
              selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId),
            };
          }),
        updateClip: (clipId, updates) =>
          mutate(clipUpdateLabel(updates), true, (s) => ({
            clips: { ...s.clips, [clipId]: { ...s.clips[clipId], ...updates } as Clip },
          })),
        selectClips: (clipIds) => set({ selectedClipIds: clipIds }),
        selectNotes: (noteIds) => set({ selectedNoteIds: noteIds }),

        // === Pattern Actions ===
        addPattern: (pattern) =>
          mutate('add-pattern', false, (s) => ({ patterns: [...s.patterns, pattern] })),
        removePattern: (patternId) =>
          mutate('delete-pattern', false, (s) => ({
            patterns: s.patterns.filter((p) => p.id !== patternId),
          })),
        updatePattern: (patternId, updates) =>
          mutate('edit-pattern', true, (s) => ({
            patterns: s.patterns.map((p) => (p.id === patternId ? { ...p, ...updates } : p)),
          })),

        // === Mixer Actions ===
        setMasterVolume: (volume) =>
          mutate('master-volume', true, () => ({ masterVolume: volume })),
        setTrackVolume: (trackId, volume) =>
          mutate('track-volume', true, (s) => trackPatch(s, trackId, { volume })),
        setTrackPan: (trackId, pan) =>
          mutate('track-pan', true, (s) => trackPatch(s, trackId, { pan })),
        toggleTrackMute: (trackId) =>
          mutate('track-mute', false, (s) => {
            const t = s.tracks.find((x) => x.id === trackId);
            return t ? trackPatch(s, trackId, { muted: !t.muted }) : s;
          }),
        toggleTrackSolo: (trackId) =>
          mutate('track-solo', false, (s) => {
            const t = s.tracks.find((x) => x.id === trackId);
            return t ? trackPatch(s, trackId, { soloed: !t.soloed }) : s;
          }),
        toggleTrackArm: (trackId) =>
          mutate('track-arm', false, (s) => {
            const t = s.tracks.find((x) => x.id === trackId);
            return t ? trackPatch(s, trackId, { armed: !t.armed }) : s;
          }),
        // === UI Actions ===
        setActiveView:
          (
            view,
          ) =>
            set(
              {
                activeView:
                  view,
              },
            ),
        setSelectedTool:
          (
            tool,
          ) =>
            set(
              {
                selectedTool:
                  tool,
              },
            ),
        setSnapEnabled:
          (
            enabled,
          ) =>
            set(
              {
                snapEnabled:
                  enabled,
              },
            ),
        setSnapValue:
          (
            value,
          ) =>
            set(
              {
                snapValue:
                  value,
              },
            ),
        setZoom:
          (
            x,
            y,
          ) =>
            set(
              {
                zoomX:
                  x,
                zoomY:
                  y,
              },
            ),
        setScroll:
          (
            x,
            y,
          ) =>
            set(
              {
                scrollX:
                  x,
                scrollY:
                  y,
              },
            ),
        toggleSampleBrowser:
          () =>
            set(
              (
                s,
              ) => ({
                sampleBrowserOpen:
                  !s.sampleBrowserOpen,
              }),
            ),
        openPluginWindow:
          (
            id,
          ) =>
            set(
              (
                s,
              ) => ({
                openPluginWindows:
                  s.openPluginWindows.includes(
                    id,
                  )
                    ? s.openPluginWindows
                    : [
                        ...s.openPluginWindows,
                        id,
                      ],
              }),
            ),
        closePluginWindow:
          (
            id,
          ) =>
            set(
              (
                s,
              ) => ({
                openPluginWindows:
                  s.openPluginWindows.filter(
                    (
                      w,
                    ) =>
                      w !==
                      id,
                  ),
              }),
            ),
        setPianoRollClip: (clipId) => set({ pianoRollClipId: clipId, selectedNoteIds: [] }),
        setPianoRollNoteLength:
          (
            beats,
          ) =>
            set(
              {
                pianoRollNoteLength:
                  beats,
              },
            ),

        // === Keybind Actions ===
        setTypingKeyboardEnabled:
          (
            enabled,
          ) =>
            set(
              {
                typingKeyboardEnabled:
                  enabled,
              },
            ),
        setTypingKeyboardOctave:
          (
            octave,
          ) =>
            set(
              {
                typingKeyboardOctave:
                  Math.max(
                    0,
                    Math.min(
                      8,
                      octave,
                    ),
                  ),
              },
            ),

        // === Settings Actions ===
        updateSettings:
          (
            partial,
          ) =>
            set(
              (
                s,
              ) => ({
                settings:
                  {
                    ...s.settings,
                    ...partial,
                  },
              }),
            ),
        setKeybindOverride:
          (
            actionId,
            keys,
          ) =>
            set(
              (
                s,
              ) => ({
                settings:
                  {
                    ...s.settings,
                    keybindOverrides:
                      {
                        ...s
                          .settings
                          .keybindOverrides,
                        [actionId]:
                          keys,
                      },
                  },
              }),
            ),
        resetKeybinds:
          () =>
            set(
              (
                s,
              ) => ({
                settings:
                  {
                    ...s.settings,
                    keybindOverrides:
                      {},
                  },
              }),
            ),

        // === Project Actions ===
        setProject: (id, name, tracks, clips, patterns, bpm, ts, masterVolume) => {
          set({
            projectId: id,
            projectName: name,
            tracks,
            clips,
            patterns,
            bpm,
            timeSignature: ts,
            masterVolume,
            projectDirty: false,
            isPlaying: false,
            isRecording: false,
            currentBeat: 0,
            selectedTrackId: tracks[0]?.id ?? null,
            selectedClipIds: [],
            selectedNoteIds: [],
            history: createHistory(),
            lastHistoryMove: null,
          });
          savedDoc = selectDoc(get());
        },
        markDirty: () => set({ projectDirty: true }),
        markClean: () => {
          savedDoc = selectDoc(get());
          set({ projectDirty: false });
        },
        setProjectIdentity: (id, name) => set({ projectId: id, projectName: name }),
        newProject: () => {
          set({
            projectId: null,
            projectName: 'Untitled Project',
            projectDirty: false,
            tracks: [],
            clips: {},
            patterns: [],
            bpm: DEFAULT_BPM,
            timeSignature: DEFAULT_TIME_SIGNATURE,
            masterVolume: 1,
            isPlaying: false,
            isRecording: false,
            currentBeat: 0,
            selectedTrackId: null,
            selectedClipIds: [],
            selectedNoteIds: [],
            openPluginWindows: [],
            pianoRollClipId: null,
            history: createHistory(),
            lastHistoryMove: null,
          });
          savedDoc = selectDoc(get());
        },

        // === History ===
        history: createHistory(),
        lastHistoryMove: null,
        undo: () => travel('undo'),
        redo: () => travel('redo'),
        runStep: (label, fn) => {
          if (stepDepth > 0) {
            fn();
            return;
          }
          const before = selectDoc(get());
          stepDepth++;
          try {
            fn();
          } finally {
            stepDepth--;
          }
          const after = selectDoc(get());
          if (docEqual(before, after) || !historyActive()) return;
          set({ history: commit(get().history, label, before, Date.now(), false) });
        },
        flushHistory: () => flushNow(),
        clearHistory: () => {
          clearFlushTimer();
          set({ history: createHistory(), lastHistoryMove: null });
          savedDoc = selectDoc(get());
        },
      };
      },
      {
        name: 'rmh-studio-settings',
        // Only persist settings (keybinds, audio prefs, recent projects)
        partialize:
          (
            state,
          ) => ({
            settings:
              state.settings,
          }),
      },
    ),
  );

// A held pointer is a gesture in progress: its changes stay one step until the pointer is released.
// The listeners are added once per module instance and removed when HMR replaces it.
if (typeof window !== 'undefined') {
  const press = () => {
    pointerHeld = true;
  };
  const release = () => {
    pointerHeld = false;
    useStudioStore.getState().flushHistory();
  };
  window.addEventListener('pointerdown', press);
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  // A pointer released outside the window never reports pointerup; losing focus ends the gesture too.
  window.addEventListener('blur', release);
  (import.meta as unknown as { hot?: { dispose: (cb: () => void) => void } }).hot?.dispose(() => {
    window.removeEventListener('pointerdown', press);
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
    window.removeEventListener('blur', release);
  });
}

// Remote jam edits go through the same store, so history is dropped when a jam connects and again when it ends:
// otherwise Undo after leaving would rewind other people's edits.
useJamStore.subscribe((state, prev) => {
  if (state.status !== prev.status && (state.status === 'off' || prev.status === 'off')) {
    useStudioStore.getState().clearHistory();
  }
});
