/**
 * InstructionsScreen — Displays minigame instructions before play begins.
 *
 * Shows title, description, rules, control hints, and a countdown timer bar.
 * The progress bar is synced with the centralized timer from the store
 * (respects server-driven ticks and pause/resume).
 * Host can skip the instructions phase.
 *
 * Props:
 *   title: string — Minigame title
 *   description: string — Minigame description
 *   rules: string[] — List of rules
 *   tips: string[] — List of control/play tips
 *   durationSeconds: number — Instructions phase total duration (for ratio calculation)
 *   isHost: boolean — Whether current user is host
 *   onSkip: () => void — Callback for host to skip instructions
 */
'use client';

import { BookOpen, Lightbulb, SkipForward } from 'lucide-react';
import { useTranslation } from "react-i18next";
import { useRMHboxStore } from '@/lib/rmhbox/store';

interface InstructionsScreenProps {
  title: string;
  description: string;
  rules: string[];
  tips: string[];
  durationSeconds: number;
  isHost: boolean;
  onSkip: () => void;
}

export default function InstructionsScreen({
  title,
  description,
  rules,
  tips,
  durationSeconds,
  isHost,
  onSkip,
}: InstructionsScreenProps) {
  const { t } = useTranslation("c-rmhbox");
  const timerInfo = useRMHboxStore((s) => s.timerInfo);
  const remaining = timerInfo?.remaining ?? durationSeconds;
  const total = timerInfo?.total ?? durationSeconds;
  const paused = timerInfo?.paused ?? false;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6 text-(--rmhbox-text)">
      {/* Timer bar — synced with server timer, respects pauses */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--rmhbox-border)">
        <div
          className={`h-full rounded-full ${paused ? 'bg-(--rmhbox-warning)' : 'bg-(--rmhbox-accent)'} ${paused ? '' : 'transition-all duration-1000 ease-linear'}`}
          style={{ width: `${(Math.max(0, remaining) / (total || 1)) * 100}%` }}
        />
      </div>

      {/* Title + description */}
      <div className="text-center">
        <h2 className="text-3xl font-bold">{title}</h2>
        <p className="mt-2 text-(--rmhbox-text-muted)">{description}</p>
      </div>

      {/* Rules */}
      {rules.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <BookOpen className="h-4 w-4" /> {t("rules", { defaultValue: "Rules" })}
          </h3>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {rules.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tips */}
      {tips.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
            <Lightbulb className="h-4 w-4" /> {t("tips", { defaultValue: "Tips" })}
          </h3>
          <ul className="list-inside list-disc space-y-1 text-sm text-(--rmhbox-text-muted)">
            {tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Host skip button */}
      {isHost && (
        <button
          onClick={onSkip}
          className="mx-auto flex items-center gap-2 rounded-lg bg-(--rmhbox-surface) border border-(--rmhbox-border) px-4 py-2 text-sm font-medium text-(--rmhbox-text-muted) transition-colors hover:bg-(--rmhbox-surface-hover) hover:text-(--rmhbox-text)"
        >
          <SkipForward className="h-4 w-4" /> {t("skip-instructions", { defaultValue: "Skip Instructions" })}
        </button>
      )}
    </div>
  );
}
