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
import { DEFAULT_SETTINGS, DEFAULT_BPM, DEFAULT_TIME_SIGNATURE, TRACK_COLORS, DEFAULT_TRACK_HEIGHT } from './constants';

// ─── Store Interface ────────────────────────────────────────────────────────

export interface StudioStore {
  // === Project ===
  projectId: string | null;
  projectName: string;
  projectDirty: boolean;

  // === Transport ===
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  timeSignature: [number, number];
  currentBeat: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;

  // === Tracks ===
  tracks: Track[];
  selectedTrackId: string | null;

  // === Clips ===
  clips: Record<string, Clip>;
  selectedClipIds: string[];

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
  pianoRollClipId: string | null;
  pianoRollNoteLength: number;

  // === Keybinds ===
  typingKeyboardEnabled: boolean;
  typingKeyboardOctave: number;

  // === Settings (persisted) ===
  settings: StudioSettings;

  // === Actions: Transport ===
  setIsPlaying: (playing: boolean) => void;
  setIsRecording: (recording: boolean) => void;
  setBpm: (bpm: number) => void;
  setTimeSignature: (ts: [number, number]) => void;
  setCurrentBeat: (beat: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopPoints: (start: number, end: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;

  // === Actions: Tracks ===
  addTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  selectTrack: (trackId: string | null) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // === Actions: Clips ===
  addClip: (clip: Clip) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  selectClips: (clipIds: string[]) => void;

  // === Actions: Patterns ===
  addPattern: (pattern: Pattern) => void;
  removePattern: (patternId: string) => void;
  updatePattern: (patternId: string, updates: Partial<Pattern>) => void;

  // === Actions: Mixer ===
  setMasterVolume: (volume: number) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;

  // === Actions: UI ===
  setActiveView: (view: ViewMode) => void;
  setSelectedTool: (tool: ToolMode) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapValue: (value: number) => void;
  setZoom: (x: number, y: number) => void;
  setScroll: (x: number, y: number) => void;
  toggleSampleBrowser: () => void;
  openPluginWindow: (pluginInstanceId: string) => void;
  closePluginWindow: (pluginInstanceId: string) => void;
  setPianoRollClip: (clipId: string | null) => void;
  setPianoRollNoteLength: (beats: number) => void;

  // === Actions: Keybinds ===
  setTypingKeyboardEnabled: (enabled: boolean) => void;
  setTypingKeyboardOctave: (octave: number) => void;

  // === Actions: Settings ===
  updateSettings: (partial: Partial<StudioSettings>) => void;
  setKeybindOverride: (actionId: string, keys: string[]) => void;
  resetKeybinds: () => void;

  // === Actions: Project ===
  setProject: (id: string, name: string, tracks: Track[], clips: Record<string, Clip>, patterns: Pattern[], bpm: number, ts: [number, number], masterVolume: number) => void;
  markDirty: () => void;
  markClean: () => void;
  newProject: () => void;
}

// ─── Store Creation ─────────────────────────────────────────────────────────

let nextTrackColorIdx = 0;
function getNextTrackColor(): string {
  const color = TRACK_COLORS[nextTrackColorIdx % TRACK_COLORS.length];
  nextTrackColorIdx++;
  return color;
}

export const useStudioStore = create<StudioStore>()(
  persist(
    (set, get) => ({
      // === Initial State ===
      projectId: null,
      projectName: 'Untitled Project',
      projectDirty: false,

      isPlaying: false,
      isRecording: false,
      bpm: DEFAULT_BPM,
      timeSignature: DEFAULT_TIME_SIGNATURE,
      currentBeat: 0,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 16,
      metronomeEnabled: false,

      tracks: [],
      selectedTrackId: null,

      clips: {},
      selectedClipIds: [],

      patterns: [],

      masterVolume: 1,

      activeView: 'arrangement',
      selectedTool: 'select',
      snapEnabled: true,
      snapValue: 0.25,
      zoomX: 1,
      zoomY: 1,
      scrollX: 0,
      scrollY: 0,
      openPluginWindows: [],
      sampleBrowserOpen: false,
      pianoRollClipId: null,
      pianoRollNoteLength: 0.25,

      typingKeyboardEnabled: false,
      typingKeyboardOctave: 3,

      settings: DEFAULT_SETTINGS,

      // === Transport Actions ===
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setIsRecording: (recording) => set({ isRecording: recording }),
      setBpm: (bpm) => set({ bpm, projectDirty: true }),
      setTimeSignature: (ts) => set({ timeSignature: ts, projectDirty: true }),
      setCurrentBeat: (beat) => set({ currentBeat: beat }),
      setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
      setLoopPoints: (start, end) => set({ loopStart: start, loopEnd: end }),
      setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),

      // === Track Actions ===
      addTrack: (track) =>
        set((s) => ({
          tracks: [...s.tracks, track],
          selectedTrackId: track.id,
          projectDirty: true,
        })),
      removeTrack: (trackId) =>
        set((s) => {
          const clips = { ...s.clips };
          const track = s.tracks.find((t) => t.id === trackId);
          if (track) {
            for (const clipId of track.clipIds) delete clips[clipId];
          }
          return {
            tracks: s.tracks.filter((t) => t.id !== trackId),
            clips,
            selectedTrackId: s.selectedTrackId === trackId ? null : s.selectedTrackId,
            projectDirty: true,
          };
        }),
      updateTrack: (trackId, updates) =>
        set((s) => ({
          tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
          projectDirty: true,
        })),
      selectTrack: (trackId) => set({ selectedTrackId: trackId }),
      reorderTracks: (fromIndex, toIndex) =>
        set((s) => {
          const tracks = [...s.tracks];
          const [moved] = tracks.splice(fromIndex, 1);
          tracks.splice(toIndex, 0, moved);
          return { tracks, projectDirty: true };
        }),

      // === Clip Actions ===
      addClip: (clip) =>
        set((s) => {
          const clips = { ...s.clips, [clip.id]: clip };
          const tracks = s.tracks.map((t) =>
            t.id === clip.trackId ? { ...t, clipIds: [...t.clipIds, clip.id] } : t,
          );
          return { clips, tracks, projectDirty: true };
        }),
      removeClip: (clipId) =>
        set((s) => {
          const clip = s.clips[clipId];
          if (!clip) return s;
          const clips = { ...s.clips };
          delete clips[clipId];
          const tracks = s.tracks.map((t) =>
            t.id === clip.trackId ? { ...t, clipIds: t.clipIds.filter((id) => id !== clipId) } : t,
          );
          return {
            clips,
            tracks,
            selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId),
            projectDirty: true,
          };
        }),
      updateClip: (clipId, updates) =>
        set((s) => ({
          clips: { ...s.clips, [clipId]: { ...s.clips[clipId], ...updates } as Clip },
          projectDirty: true,
        })),
      selectClips: (clipIds) => set({ selectedClipIds: clipIds }),

      // === Pattern Actions ===
      addPattern: (pattern) =>
        set((s) => ({ patterns: [...s.patterns, pattern], projectDirty: true })),
      removePattern: (patternId) =>
        set((s) => ({
          patterns: s.patterns.filter((p) => p.id !== patternId),
          projectDirty: true,
        })),
      updatePattern: (patternId, updates) =>
        set((s) => ({
          patterns: s.patterns.map((p) => (p.id === patternId ? { ...p, ...updates } : p)),
          projectDirty: true,
        })),

      // === Mixer Actions ===
      setMasterVolume: (volume) => set({ masterVolume: volume, projectDirty: true }),
      setTrackVolume: (trackId, volume) => {
        get().updateTrack(trackId, { volume });
      },
      setTrackPan: (trackId, pan) => {
        get().updateTrack(trackId, { pan });
      },
      toggleTrackMute: (trackId) => {
        const track = get().tracks.find((t) => t.id === trackId);
        if (track) get().updateTrack(trackId, { muted: !track.muted });
      },
      toggleTrackSolo: (trackId) => {
        const track = get().tracks.find((t) => t.id === trackId);
        if (track) get().updateTrack(trackId, { soloed: !track.soloed });
      },
      toggleTrackArm: (trackId) => {
        const track = get().tracks.find((t) => t.id === trackId);
        if (track) get().updateTrack(trackId, { armed: !track.armed });
      },

      // === UI Actions ===
      setActiveView: (view) => set({ activeView: view }),
      setSelectedTool: (tool) => set({ selectedTool: tool }),
      setSnapEnabled: (enabled) => set({ snapEnabled: enabled }),
      setSnapValue: (value) => set({ snapValue: value }),
      setZoom: (x, y) => set({ zoomX: x, zoomY: y }),
      setScroll: (x, y) => set({ scrollX: x, scrollY: y }),
      toggleSampleBrowser: () => set((s) => ({ sampleBrowserOpen: !s.sampleBrowserOpen })),
      openPluginWindow: (id) =>
        set((s) => ({
          openPluginWindows: s.openPluginWindows.includes(id) ? s.openPluginWindows : [...s.openPluginWindows, id],
        })),
      closePluginWindow: (id) =>
        set((s) => ({
          openPluginWindows: s.openPluginWindows.filter((w) => w !== id),
        })),
      setPianoRollClip: (clipId) => set({ pianoRollClipId: clipId }),
      setPianoRollNoteLength: (beats) => set({ pianoRollNoteLength: beats }),

      // === Keybind Actions ===
      setTypingKeyboardEnabled: (enabled) => set({ typingKeyboardEnabled: enabled }),
      setTypingKeyboardOctave: (octave) => set({ typingKeyboardOctave: Math.max(0, Math.min(8, octave)) }),

      // === Settings Actions ===
      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
      setKeybindOverride: (actionId, keys) =>
        set((s) => ({
          settings: {
            ...s.settings,
            keybindOverrides: { ...s.settings.keybindOverrides, [actionId]: keys },
          },
        })),
      resetKeybinds: () =>
        set((s) => ({
          settings: { ...s.settings, keybindOverrides: {} },
        })),

      // === Project Actions ===
      setProject: (id, name, tracks, clips, patterns, bpm, ts, masterVolume) =>
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
        }),
      markDirty: () => set({ projectDirty: true }),
      markClean: () => set({ projectDirty: false }),
      newProject: () =>
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
          openPluginWindows: [],
          pianoRollClipId: null,
        }),
    }),
    {
      name: 'rmh-studio-settings',
      // Only persist settings (keybinds, audio prefs, recent projects)
      partialize: (state) => ({ settings: state.settings }),
    },
  ),
);
