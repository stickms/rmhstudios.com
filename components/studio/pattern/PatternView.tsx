import { useState, useCallback } from 'react';
import { Plus, Play, Pause } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '@/lib/studio/store';
import { RMHDrums } from '@/lib/studio/plugins/instruments/RMHDrums';
import type { Pattern, PatternStep } from '@/lib/studio/types';

const STEPS = 16;
const DEFAULT_VELOCITY = 100;

export function PatternView() {
  const { t } = useTranslation("c-studio");
  const { patterns, addPattern, updatePattern, isPlaying } = useStudioStore();
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(patterns[0]?.id ?? null);
  const [currentStep, setCurrentStep] = useState(-1);

  const selectedPattern = patterns.find((p) => p.id === selectedPatternId);

  const handleCreatePattern = () => {
    const id = crypto.randomUUID();
    const newPattern: Pattern = {
      id,
      name: `Pattern ${patterns.length + 1}`,
      lengthBeats: 4,
      stepsPerBeat: 4,
      tracks: RMHDrums.PAD_LABELS.slice(0, 8).map((label, i) => ({
        instrumentId: `drum-${i}`,
        steps: Array.from({ length: STEPS }, () => ({
          active: false,
          velocity: DEFAULT_VELOCITY,
        })),
      })),
    };
    addPattern(newPattern);
    setSelectedPatternId(id);
  };

  const toggleStep = (trackIdx: number, stepIdx: number) => {
    if (!selectedPattern) return;
    const tracks = selectedPattern.tracks.map((t, ti) => {
      if (ti !== trackIdx) return t;
      const steps = t.steps.map((s, si) => {
        if (si !== stepIdx) return s;
        return { ...s, active: !s.active };
      });
      return { ...t, steps };
    });
    updatePattern(selectedPattern.id, { tracks });
  };

  // ─── Empty state ──────────────────────────────────────────────────────
  if (patterns.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--site-muted)]">
        <p className="text-sm">{t("no-patterns-yet", { defaultValue: "No patterns yet" })}</p>
        <button
          onClick={handleCreatePattern}
          className="flex items-center gap-2 rounded-lg bg-cyan-500/20 px-4 py-2 text-sm text-cyan-400 hover:bg-cyan-500/30"
        >
          <Plus className="h-4 w-4" />
          {t("create-pattern", { defaultValue: "Create Pattern" })}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Pattern header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--site-border)] bg-[var(--site-surface)] px-3 py-1.5">
        {/* Pattern selector */}
        <select
          value={selectedPatternId ?? ''}
          onChange={(e) => setSelectedPatternId(e.target.value)}
          className="rounded bg-black/30 px-2 py-0.5 text-xs text-[var(--site-text)] outline-none"
        >
          {patterns.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          onClick={handleCreatePattern}
          className="rounded p-1 text-[var(--site-muted)] hover:bg-white/10"
          title={t("new-pattern", { defaultValue: "New Pattern" })}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Step sequencer grid */}
      {selectedPattern && (
        <div className="flex-1 overflow-auto p-2">
          <div className="space-y-0.5">
            {selectedPattern.tracks.map((track, trackIdx) => (
              <div key={trackIdx} className="flex items-center gap-1">
                {/* Row label */}
                <div className="w-16 shrink-0 truncate text-right text-[10px] text-[var(--site-muted)]">
                  {RMHDrums.PAD_LABELS[trackIdx] || t("pad-number", { defaultValue: "Pad {{number}}", number: trackIdx + 1 })}
                </div>

                {/* Steps */}
                <div className="flex gap-0.5">
                  {track.steps.map((step, stepIdx) => {
                    const isBeatStart = stepIdx % 4 === 0;
                    const isCurrentStep = stepIdx === currentStep && isPlaying;

                    return (
                      <button
                        key={stepIdx}
                        onClick={() => toggleStep(trackIdx, stepIdx)}
                        className={`h-7 rounded-sm transition-colors ${
                          isBeatStart ? 'ml-1' : ''
                        } ${
                          step.active
                            ? 'bg-cyan-500/80 hover:bg-cyan-400/80'
                            : 'bg-white/5 hover:bg-white/10'
                        } ${
                          isCurrentStep ? 'ring-1 ring-white/50' : ''
                        }`}
                        style={{
                          width: 28,
                          minWidth: 28,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
