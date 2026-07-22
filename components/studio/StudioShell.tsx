import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Play, Pause, Square, Circle, Repeat,
  Music4, Piano, SlidersHorizontal, Grid3X3, FolderOpen,
  Settings, Keyboard, AudioLines, ChevronDown, ChevronUp,
  MousePointer2, Pencil, Eraser, Scissors, VolumeX, Save,
} from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useStudioStore } from '@/lib/studio/store';
import { useIsMobile } from '@/lib/studio/hooks/useIsMobile';
import { useKeybinds } from '@/lib/studio/hooks/useKeybinds';
import { useTransport } from '@/lib/studio/hooks/useTransport';
import { StudioEngine } from '@/lib/studio/engine/StudioEngine';
import { ArrangementView } from '@/components/studio/arrangement/ArrangementView';
import { MixerView } from '@/components/studio/mixer/MixerView';
import { PianoRollView } from '@/components/studio/piano-roll/PianoRollView';
import { PatternView } from '@/components/studio/pattern/PatternView';
import { SampleBrowser } from '@/components/studio/SampleBrowser';
import { KeybindSettings } from '@/components/studio/KeybindSettings';
import { MIN_BPM, MAX_BPM, SNAP_VALUES } from '@/lib/studio/constants';
import type { ViewMode, ToolMode } from '@/lib/studio/types';

// ─── Transport Bar ──────────────────────────────────────────────────────────

function TransportBar({ compact = false, onSettingsToggle }: { compact?: boolean; onSettingsToggle?: () => void }) {
  const {
    isPlaying, isRecording, bpm, timeSignature, currentBeat,
    loopEnabled, metronomeEnabled, typingKeyboardEnabled,
    setIsPlaying, setIsRecording, setBpm, setLoopEnabled,
    setMetronomeEnabled, setTypingKeyboardEnabled,
  } = useStudioStore();

  const { t } = useTranslation("c-studio");
  const [expandedMobile, setExpandedMobile] = useState(false);

  const formatPosition = (beat: number): string => {
    const bar = Math.floor(beat / timeSignature[0]) + 1;
    const beatInBar = Math.floor(beat % timeSignature[0]) + 1;
    const tick = Math.floor((beat % 1) * 100);
    return `${bar}.${beatInBar}.${tick.toString().padStart(2, '0')}`;
  };

  const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= MIN_BPM && val <= MAX_BPM) setBpm(val);
  };

  const transportButtons = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => { setIsPlaying(false); }}
        className="rounded p-1.5 text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]"
        title={t("stop", { defaultValue: "Stop" })}
      >
        <Square className="h-4 w-4" />
      </button>
      <button
        onClick={() => setIsPlaying(!isPlaying)}
        className={`rounded p-1.5 ${isPlaying ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'}`}
        title={t("play-pause", { defaultValue: "Play/Pause" })}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        onClick={() => setIsRecording(!isRecording)}
        className={`rounded p-1.5 ${isRecording ? 'bg-red-500/20 text-red-400' : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'}`}
        title={t("record", { defaultValue: "Record" })}
      >
        <Circle className="h-4 w-4" fill={isRecording ? 'currentColor' : 'none'} />
      </button>
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col border-b border-[var(--site-border)] bg-[var(--site-surface)]">
        <div className="flex items-center justify-between px-3 py-2">
          {transportButtons}

          <div className="font-mono text-sm font-semibold text-[var(--site-text)]">
            {formatPosition(currentBeat)}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--site-muted)]">BPM</span>
            <input
              type="number"
              inputMode="numeric"
              value={bpm}
              onChange={handleBpmChange}
              className="w-14 rounded bg-black/30 px-1.5 py-0.5 text-center text-sm text-[var(--site-text)] outline-none focus:ring-1 focus:ring-cyan-500"
              min={MIN_BPM}
              max={MAX_BPM}
            />
            <button
              onClick={() => setExpandedMobile(!expandedMobile)}
              className="rounded p-1 text-[var(--site-muted)] hover:bg-white/10"
            >
              {expandedMobile ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expandedMobile && (
          <div className="flex items-center gap-3 border-t border-[var(--site-border)] px-3 py-2">
            <button
              onClick={() => setLoopEnabled(!loopEnabled)}
              className={`rounded p-1.5 ${loopEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--site-muted)]'}`}
              title={t("loop", { defaultValue: "Loop" })}
            >
              <Repeat className="h-4 w-4" />
            </button>
            <button
              onClick={() => setMetronomeEnabled(!metronomeEnabled)}
              className={`rounded p-1.5 ${metronomeEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--site-muted)]'}`}
              title={t("metronome", { defaultValue: "Metronome" })}
            >
              <AudioLines className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTypingKeyboardEnabled(!typingKeyboardEnabled)}
              className={`rounded p-1.5 ${typingKeyboardEnabled ? 'bg-purple-500/20 text-purple-400' : 'text-[var(--site-muted)]'}`}
              title={t("typing-keyboard", { defaultValue: "Typing Keyboard" })}
            >
              <Keyboard className="h-4 w-4" />
            </button>
            <div className="ml-auto text-xs text-[var(--site-muted)]">
              {timeSignature[0]}/{timeSignature[1]}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop transport
  return (
    <div className="flex h-12 items-center gap-4 border-b border-[var(--site-border)] bg-[var(--site-surface)] px-4">
      {/* Transport controls */}
      {transportButtons}

      {/* Position display */}
      <div className="min-w-[100px] rounded bg-black/40 px-3 py-1 text-center font-mono text-sm font-semibold text-[var(--site-text)]">
        {formatPosition(currentBeat)}
      </div>

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-[var(--site-muted)]">BPM</span>
        <input
          type="number"
          inputMode="numeric"
          value={bpm}
          onChange={handleBpmChange}
          className="w-16 rounded bg-black/30 px-2 py-1 text-center text-sm text-[var(--site-text)] outline-none focus:ring-1 focus:ring-cyan-500"
          min={MIN_BPM}
          max={MAX_BPM}
        />
      </div>

      {/* Time signature */}
      <div className="text-sm text-[var(--site-muted)]">
        {timeSignature[0]}/{timeSignature[1]}
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--site-border)]" />

      {/* Loop */}
      <button
        onClick={() => setLoopEnabled(!loopEnabled)}
        className={`rounded p-1.5 ${loopEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'}`}
        title={t("loop-shortcut", { defaultValue: "Loop (Ctrl+L)" })}
      >
        <Repeat className="h-4 w-4" />
      </button>

      {/* Metronome */}
      <button
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        className={`rounded p-1.5 ${metronomeEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'}`}
        title={t("metronome-shortcut", { defaultValue: "Metronome (Ctrl+M)" })}
      >
        <AudioLines className="h-4 w-4" />
      </button>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--site-border)]" />

      {/* Typing keyboard toggle */}
      <button
        onClick={() => setTypingKeyboardEnabled(!typingKeyboardEnabled)}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
          typingKeyboardEnabled
            ? 'bg-purple-500/20 text-purple-400'
            : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'
        }`}
        title={t("typing-keyboard-shortcut", { defaultValue: "Typing Keyboard (\\)" })}
      >
        <Keyboard className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">{t("keys", { defaultValue: "Keys" })}</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-side controls */}
      <div className="flex items-center gap-1">
        {/* Sample browser toggle */}
        <button
          onClick={() => useStudioStore.getState().toggleSampleBrowser()}
          className={`rounded p-1.5 ${
            useStudioStore.getState().sampleBrowserOpen
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'
          }`}
          title={t("sample-browser", { defaultValue: "Sample Browser" })}
        >
          <FolderOpen className="h-4 w-4" />
        </button>

        {/* Save */}
        <button
          className="rounded p-1.5 text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]"
          title={t("save-project", { defaultValue: "Save Project (Ctrl+S)" })}
        >
          <Save className="h-4 w-4" />
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsToggle}
          className="rounded p-1.5 text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]"
          title={t("settings-keybinds", { defaultValue: "Settings & Keybinds" })}
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────────────

function Toolbar() {
  const { t } = useTranslation("c-studio");
  const { activeView, setActiveView, selectedTool, setSelectedTool, snapEnabled, setSnapEnabled, snapValue, setSnapValue } = useStudioStore();

  const views: { id: ViewMode; icon: React.ComponentType<{ className?: string }>; label: string; shortcut: string }[] = [
    { id: 'arrangement', icon: Music4, label: t("view-arrangement", { defaultValue: "Arrangement" }), shortcut: '1' },
    { id: 'pianoRoll', icon: Piano, label: t("view-piano-roll", { defaultValue: "Piano Roll" }), shortcut: '2' },
    { id: 'mixer', icon: SlidersHorizontal, label: t("view-mixer", { defaultValue: "Mixer" }), shortcut: '3' },
    { id: 'pattern', icon: Grid3X3, label: t("view-pattern", { defaultValue: "Pattern" }), shortcut: '4' },
  ];

  const tools: { id: ToolMode; icon: React.ComponentType<{ className?: string }>; label: string; shortcut: string }[] = [
    { id: 'select', icon: MousePointer2, label: t("tool-select", { defaultValue: "Select" }), shortcut: 'V' },
    { id: 'draw', icon: Pencil, label: t("tool-draw", { defaultValue: "Draw" }), shortcut: 'B' },
    { id: 'erase', icon: Eraser, label: t("tool-erase", { defaultValue: "Erase" }), shortcut: 'E' },
    { id: 'slice', icon: Scissors, label: t("tool-slice", { defaultValue: "Slice" }), shortcut: 'S' },
    { id: 'mute', icon: VolumeX, label: t("tool-mute", { defaultValue: "Mute" }), shortcut: 'Q' },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-[var(--site-border)] bg-[var(--site-surface)] px-3 py-1.5">
      {/* View switcher */}
      {views.map(({ id, icon: Icon, label, shortcut }) => (
        <button
          key={id}
          onClick={() => setActiveView(id)}
          className={`rounded px-2 py-1 text-xs ${
            activeView === id
              ? 'bg-white/10 font-medium text-[var(--site-text)]'
              : 'text-[var(--site-muted)] hover:bg-white/5 hover:text-[var(--site-text)]'
          }`}
          title={`${label} (${shortcut})`}
        >
          <Icon className="inline-block h-3.5 w-3.5 mr-1" />
          <span className="hidden xl:inline">{label}</span>
        </button>
      ))}

      <div className="mx-2 h-5 w-px bg-[var(--site-border)]" />

      {/* Tools */}
      {tools.map(({ id, icon: Icon, label, shortcut }) => (
        <button
          key={id}
          onClick={() => setSelectedTool(id)}
          className={`rounded p-1.5 ${
            selectedTool === id
              ? 'bg-cyan-500/20 text-cyan-400'
              : 'text-[var(--site-muted)] hover:bg-white/10 hover:text-[var(--site-text)]'
          }`}
          title={`${label} (${shortcut})`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}

      <div className="mx-2 h-5 w-px bg-[var(--site-border)]" />

      {/* Snap toggle */}
      <button
        onClick={() => setSnapEnabled(!snapEnabled)}
        className={`rounded px-2 py-1 text-xs ${
          snapEnabled ? 'bg-cyan-500/20 text-cyan-400' : 'text-[var(--site-muted)] hover:bg-white/10'
        }`}
      >
        {t("snap", { defaultValue: "Snap" })}
      </button>

      {/* Snap value */}
      <select
        value={snapValue}
        onChange={(e) => setSnapValue(parseFloat(e.target.value))}
        className="rounded bg-black/30 px-1.5 py-0.5 text-xs text-[var(--site-text)] outline-none"
      >
        {SNAP_VALUES.map((sv) => (
          <option key={sv.beats} value={sv.beats}>
            {sv.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── View wrappers ──────────────────────────────────────────────────────────

// ─── Mobile Tab Bar ─────────────────────────────────────────────────────────

function MobileTabBar({ onSettingsToggle, settingsOpen }: { onSettingsToggle?: () => void; settingsOpen?: boolean }) {
  const { t } = useTranslation("c-studio");
  const { activeView, setActiveView, sampleBrowserOpen, toggleSampleBrowser } = useStudioStore();

  const tabs: { id: ViewMode | 'samples' | 'settings'; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { id: 'arrangement', icon: Music4, label: t("tab-arrange", { defaultValue: "Arrange" }) },
    { id: 'pianoRoll', icon: Piano, label: t("tab-piano", { defaultValue: "Piano" }) },
    { id: 'pattern', icon: Grid3X3, label: t("tab-drums", { defaultValue: "Drums" }) },
    { id: 'mixer', icon: SlidersHorizontal, label: t("view-mixer", { defaultValue: "Mixer" }) },
    { id: 'samples', icon: FolderOpen, label: t("tab-samples", { defaultValue: "Samples" }) },
    { id: 'settings', icon: Settings, label: t("tab-settings", { defaultValue: "Settings" }) },
  ];

  return (
    <div className="flex border-t border-[var(--site-border)] bg-[var(--site-surface)]">
      {tabs.map(({ id, icon: Icon, label }) => {
        const isActive =
          id === 'samples' ? sampleBrowserOpen :
          id === 'settings' ? settingsOpen :
          !settingsOpen && !sampleBrowserOpen && activeView === id;
        return (
          <button
            key={id}
            onClick={() => {
              if (id === 'settings') {
                onSettingsToggle?.();
              } else if (id === 'samples') {
                if (settingsOpen) onSettingsToggle?.();
                toggleSampleBrowser();
              } else {
                if (settingsOpen) onSettingsToggle?.();
                setActiveView(id);
                if (sampleBrowserOpen) toggleSampleBrowser();
              }
            }}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 ${
              isActive ? 'text-cyan-400' : 'text-[var(--site-muted)]'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[10px]">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Active View Router ─────────────────────────────────────────────────────

function ActiveView({ isMobile = false }: { isMobile?: boolean }) {
  const { activeView } = useStudioStore();

  switch (activeView) {
    case 'arrangement':
      return <ArrangementView isMobile={isMobile} />;
    case 'pianoRoll':
      return <PianoRollView />;
    case 'mixer':
      return <MixerView compact={isMobile} />;
    case 'pattern':
      return <PatternView />;
    default:
      return <ArrangementView isMobile={isMobile} />;
  }
}

// ─── Studio Shell ───────────────────────────────────────────────────────────

export default function StudioShell() {
  const { t } = useTranslation("c-studio");
  const isMobile = useIsMobile();
  const { sampleBrowserOpen } = useStudioStore();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Initialize keybinds and transport bridge
  useKeybinds();
  useTransport();

  // Initialize audio engine on first user interaction
  const [engineReady, setEngineReady] = useState(false);
  const initEngine = useCallback(async () => {
    if (engineReady) return;
    try {
      const engine = StudioEngine.getInstance();
      await engine.initialize();
      setEngineReady(true);
    } catch (err) {
      console.error('Failed to initialize audio engine:', err);
    }
  }, [engineReady]);

  // Auto-init on first click/tap
  useEffect(() => {
    const handler = () => {
      initEngine();
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
    window.addEventListener('click', handler);
    window.addEventListener('touchstart', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('touchstart', handler);
    };
  }, [initEngine]);

  // ─── Mobile Layout ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col bg-[var(--site-bg)]">
        <TransportBar compact onSettingsToggle={() => setSettingsOpen(!settingsOpen)} />

        <div className="relative flex-1 overflow-hidden">
          {settingsOpen ? <KeybindSettings /> : sampleBrowserOpen ? <SampleBrowser /> : <ActiveView isMobile />}
        </div>

        <MobileTabBar onSettingsToggle={() => setSettingsOpen(!settingsOpen)} settingsOpen={settingsOpen} />
      </div>
    );
  }

  // ─── Desktop Layout ─────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col bg-[var(--site-bg)]">
      <TransportBar onSettingsToggle={() => setSettingsOpen(!settingsOpen)} />
      <Toolbar />

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          {/* Sample browser sidebar (collapsible) */}
          {sampleBrowserOpen && (
            <>
              <ResizablePanel defaultSize="15%" minSize="10%" maxSize="25%">
                <SampleBrowser />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Main content area */}
          <ResizablePanel defaultSize={sampleBrowserOpen ? '85%' : '100%'}>
            <ResizablePanelGroup orientation="vertical">
              {/* Top: Arrangement / Piano Roll / Pattern */}
              <ResizablePanel defaultSize="65%" minSize="30%">
                <ActiveView />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Bottom: Mixer or Settings */}
              <ResizablePanel defaultSize="35%" minSize="20%">
                {settingsOpen ? <KeybindSettings /> : <MixerView />}
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Status bar */}
      <div className="flex h-6 items-center justify-between border-t border-[var(--site-border)] bg-[var(--site-surface)] px-3">
        <div className="flex items-center gap-3 text-[10px] text-[var(--site-muted)]">
          <span className={engineReady ? 'text-green-400' : 'text-yellow-400'}>
            {engineReady ? t("audio-ready", { defaultValue: "Audio Ready" }) : t("click-to-init-audio", { defaultValue: "Click to initialize audio" })}
          </span>
        </div>
        <div className="text-[10px] text-[var(--site-muted)]">RMH Studio</div>
      </div>
    </div>
  );
}
