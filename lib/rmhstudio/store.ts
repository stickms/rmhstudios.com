/**
 * RMHStudio — Zustand Store
 *
 * Single store for all DAW state. Persisted to localStorage via Zustand's
 * `persist` middleware (settings + project data). The audio engine is driven
 * imperatively — the store holds the data, and actions sync it to the engine.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Pattern,
  Channel,
  ActiveView,
  StudioSettings,
  Project,
} from './types';
import {
  createDefaultProject,
  createEmptyPattern,
  DEFAULT_CHANNELS,
} from './types';
import { AudioEngine } from './engine/AudioEngine';

// ─── Store Interface ─────────────────────────────────────────────

export interface RmhStudioStore {
  // Project data
  projectId: string;
  projectName: string;
  bpm: number;
  swing: number;
  patterns: Pattern[];
  channels: Channel[];
  currentPatternId: string;
  masterVolume: number;

  // Transport (non-persisted runtime state)
  isPlaying: boolean;
  currentStep: number;

  // UI
  activeView: ActiveView;
  selectedChannel: number;

  // Settings
  settings: StudioSettings;

  // ── Transport Actions ──────────────────────────────────────────
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlayPause: () => void;

  // ── BPM / Swing ────────────────────────────────────────────────
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;

  // ── Pattern Actions ────────────────────────────────────────────
  toggleStep: (channelIndex: number, stepIndex: number) => void;
  setStepVelocity: (channelIndex: number, stepIndex: number, velocity: number) => void;
  setCurrentPattern: (patternId: string) => void;
  addPattern: () => void;
  duplicatePattern: (patternId: string) => void;
  removePattern: (patternId: string) => void;
  renamePattern: (patternId: string, name: string) => void;
  setStepCount: (patternId: string, stepCount: number) => void;

  // ── Channel Actions ────────────────────────────────────────────
  setChannelVolume: (index: number, volume: number) => void;
  setChannelPan: (index: number, pan: number) => void;
  setChannelMute: (index: number, mute: boolean) => void;
  setChannelSolo: (index: number, solo: boolean) => void;
  setMasterVolume: (volume: number) => void;
  selectChannel: (index: number) => void;

  // ── UI Actions ─────────────────────────────────────────────────
  setActiveView: (view: ActiveView) => void;
  setCurrentStep: (step: number) => void;

  // ── Settings ───────────────────────────────────────────────────
  updateSettings: (partial: Partial<StudioSettings>) => void;

  // ── Project Actions ────────────────────────────────────────────
  setProjectName: (name: string) => void;
  loadProject: (project: Project) => void;
  newProject: () => void;
  getProjectData: () => Project;
}

// ─── Helper: sync engine from store state ────────────────────────

function syncEngine(state: RmhStudioStore) {
  const engine = AudioEngine.getInstance();
  engine.bpm = state.bpm;
  engine.swing = state.swing;
  engine.metronomeEnabled = state.settings.metronomeEnabled;
  engine.metronomeVolume = state.settings.metronomeVolume;
  engine.setMasterVolume(state.masterVolume);

  const pattern = state.patterns.find(p => p.id === state.currentPatternId);
  if (pattern) {
    engine.setData(pattern, state.channels);
  }
}

// ─── Default State ───────────────────────────────────────────────

const defaultProject = createDefaultProject();

// ─── Store ───────────────────────────────────────────────────────

export const useStudioStore = create<RmhStudioStore>()(
  persist(
    (set, get) => ({
      // Project data
      projectId: defaultProject.id,
      projectName: defaultProject.name,
      bpm: defaultProject.bpm,
      swing: defaultProject.swing,
      patterns: defaultProject.patterns,
      channels: defaultProject.channels,
      currentPatternId: defaultProject.currentPatternId,
      masterVolume: defaultProject.masterVolume,

      // Runtime (not persisted)
      isPlaying: false,
      currentStep: 0,

      // UI
      activeView: 'sequencer',
      selectedChannel: 0,

      // Settings
      settings: {
        theme: 'dark',
        metronomeEnabled: false,
        metronomeVolume: 0.3,
      },

      // ── Transport ──────────────────────────────────────────────
      play() {
        const state = get();
        const engine = AudioEngine.getInstance();
        engine.init();
        syncEngine(state);
        engine.onStep((step) => set({ currentStep: step }));
        engine.play();
        set({ isPlaying: true });
      },

      pause() {
        AudioEngine.getInstance().pause();
        set({ isPlaying: false });
      },

      stop() {
        AudioEngine.getInstance().stop();
        set({ isPlaying: false, currentStep: 0 });
      },

      togglePlayPause() {
        const { isPlaying, play, pause } = get();
        isPlaying ? pause() : play();
      },

      // ── BPM / Swing ───────────────────────────────────────────
      setBpm(bpm: number) {
        const clamped = Math.max(40, Math.min(300, bpm));
        AudioEngine.getInstance().bpm = clamped;
        set({ bpm: clamped });
      },

      setSwing(swing: number) {
        const clamped = Math.max(0, Math.min(1, swing));
        AudioEngine.getInstance().swing = clamped;
        set({ swing: clamped });
      },

      // ── Pattern ────────────────────────────────────────────────
      toggleStep(channelIndex: number, stepIndex: number) {
        set(state => {
          const patterns = state.patterns.map(p => {
            if (p.id !== state.currentPatternId) return p;
            const newSteps = p.steps.map((row, ci) => {
              if (ci !== channelIndex) return row;
              return row.map((step, si) => {
                if (si !== stepIndex) return step;
                return { ...step, active: !step.active };
              });
            });
            return { ...p, steps: newSteps };
          });
          return { patterns };
        });
      },

      setStepVelocity(channelIndex: number, stepIndex: number, velocity: number) {
        set(state => {
          const patterns = state.patterns.map(p => {
            if (p.id !== state.currentPatternId) return p;
            const newSteps = p.steps.map((row, ci) => {
              if (ci !== channelIndex) return row;
              return row.map((step, si) => {
                if (si !== stepIndex) return step;
                return { ...step, velocity: Math.max(0, Math.min(1, velocity)) };
              });
            });
            return { ...p, steps: newSteps };
          });
          return { patterns };
        });
      },

      setCurrentPattern(patternId: string) {
        set({ currentPatternId: patternId });
        // Re-sync engine if playing
        if (get().isPlaying) syncEngine(get());
      },

      addPattern() {
        set(state => {
          const num = state.patterns.length + 1;
          const newPat = createEmptyPattern(
            `pat-${crypto.randomUUID().slice(0, 8)}`,
            `Pattern ${num}`,
            state.channels.length,
            16,
          );
          return {
            patterns: [...state.patterns, newPat],
            currentPatternId: newPat.id,
          };
        });
      },

      duplicatePattern(patternId: string) {
        set(state => {
          const src = state.patterns.find(p => p.id === patternId);
          if (!src) return {};
          const dup: Pattern = {
            ...src,
            id: `pat-${crypto.randomUUID().slice(0, 8)}`,
            name: `${src.name} (copy)`,
            steps: src.steps.map(row => row.map(s => ({ ...s }))),
          };
          return {
            patterns: [...state.patterns, dup],
            currentPatternId: dup.id,
          };
        });
      },

      removePattern(patternId: string) {
        set(state => {
          if (state.patterns.length <= 1) return {}; // keep at least one
          const filtered = state.patterns.filter(p => p.id !== patternId);
          const nextId = state.currentPatternId === patternId
            ? filtered[0].id
            : state.currentPatternId;
          return { patterns: filtered, currentPatternId: nextId };
        });
      },

      renamePattern(patternId: string, name: string) {
        set(state => ({
          patterns: state.patterns.map(p =>
            p.id === patternId ? { ...p, name } : p,
          ),
        }));
      },

      setStepCount(patternId: string, stepCount: number) {
        set(state => ({
          patterns: state.patterns.map(p => {
            if (p.id !== patternId) return p;
            const newSteps = p.steps.map(row => {
              if (row.length >= stepCount) return row.slice(0, stepCount);
              const extended = [...row];
              while (extended.length < stepCount) {
                extended.push({ active: false, velocity: 0.8 });
              }
              return extended;
            });
            return { ...p, stepCount, steps: newSteps };
          }),
        }));
      },

      // ── Channel Mixer ─────────────────────────────────────────
      setChannelVolume(index: number, volume: number) {
        set(state => {
          const channels = state.channels.map((ch, i) =>
            i === index ? { ...ch, volume } : ch,
          );
          AudioEngine.getInstance().getMixer()?.setChannelVolume(index, volume);
          return { channels };
        });
      },

      setChannelPan(index: number, pan: number) {
        set(state => {
          const channels = state.channels.map((ch, i) =>
            i === index ? { ...ch, pan } : ch,
          );
          AudioEngine.getInstance().getMixer()?.setChannelPan(index, pan);
          return { channels };
        });
      },

      setChannelMute(index: number, mute: boolean) {
        set(state => {
          const channels = state.channels.map((ch, i) =>
            i === index ? { ...ch, mute } : ch,
          );
          AudioEngine.getInstance().getMixer()?.setChannelMute(index, mute);
          return { channels };
        });
      },

      setChannelSolo(index: number, solo: boolean) {
        set(state => {
          const channels = state.channels.map((ch, i) =>
            i === index ? { ...ch, solo } : ch,
          );
          AudioEngine.getInstance().getMixer()?.setChannelSolo(index, solo);
          return { channels };
        });
      },

      setMasterVolume(volume: number) {
        AudioEngine.getInstance().setMasterVolume(volume);
        set({ masterVolume: volume });
      },

      selectChannel(index: number) {
        set({ selectedChannel: index });
      },

      // ── UI ─────────────────────────────────────────────────────
      setActiveView(view: ActiveView) {
        set({ activeView: view });
      },

      setCurrentStep(step: number) {
        set({ currentStep: step });
      },

      // ── Settings ───────────────────────────────────────────────
      updateSettings(partial: Partial<StudioSettings>) {
        set(state => {
          const settings = { ...state.settings, ...partial };
          const engine = AudioEngine.getInstance();
          if (partial.metronomeEnabled !== undefined) engine.metronomeEnabled = settings.metronomeEnabled;
          if (partial.metronomeVolume !== undefined) engine.metronomeVolume = settings.metronomeVolume;
          return { settings };
        });
      },

      // ── Project ────────────────────────────────────────────────
      setProjectName(name: string) {
        set({ projectName: name });
      },

      loadProject(project: Project) {
        const wasPlaying = get().isPlaying;
        if (wasPlaying) get().stop();

        set({
          projectId: project.id,
          projectName: project.name,
          bpm: project.bpm,
          swing: project.swing,
          patterns: project.patterns,
          channels: project.channels,
          currentPatternId: project.currentPatternId,
          masterVolume: project.masterVolume,
          currentStep: 0,
        });
      },

      newProject() {
        const wasPlaying = get().isPlaying;
        if (wasPlaying) get().stop();

        const proj = createDefaultProject();
        set({
          projectId: proj.id,
          projectName: proj.name,
          bpm: proj.bpm,
          swing: proj.swing,
          patterns: proj.patterns,
          channels: proj.channels,
          currentPatternId: proj.currentPatternId,
          masterVolume: proj.masterVolume,
          currentStep: 0,
        });
      },

      getProjectData(): Project {
        const s = get();
        return {
          id: s.projectId,
          name: s.projectName,
          bpm: s.bpm,
          swing: s.swing,
          patterns: s.patterns,
          channels: s.channels,
          currentPatternId: s.currentPatternId,
          masterVolume: s.masterVolume,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
    {
      name: 'rmhstudio-store',
      partialize: (state) => ({
        projectId: state.projectId,
        projectName: state.projectName,
        bpm: state.bpm,
        swing: state.swing,
        patterns: state.patterns,
        channels: state.channels,
        currentPatternId: state.currentPatternId,
        masterVolume: state.masterVolume,
        settings: state.settings,
        activeView: state.activeView,
      }),
    },
  ),
);
