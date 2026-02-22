/**
 * InstructionsScreen — Displays minigame instructions before play begins.
 *
 * Shows title, description, rules, control hints, and a countdown timer.
 * Host can skip the instructions phase.
 *
 * Props:
 *   title: string — Minigame title
 *   description: string — Minigame description
 *   rules: string[] — List of rules
 *   tips: string[] — List of control/play tips
 *   durationSeconds: number — Instructions phase duration
 *   isHost: boolean — Whether current user is host
 *   onSkip: () => void — Callback for host to skip instructions
 */
'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Lightbulb, SkipForward } from 'lucide-react';

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
  const [remaining, setRemaining] = useState(durationSeconds);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6 text-(--rmhbox-text)">
      {/* Timer bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--rmhbox-border)">
        <div
          className="h-full rounded-full bg-(--rmhbox-accent) transition-all duration-1000 ease-linear"
          style={{ width: `${(remaining / durationSeconds) * 100}%` }}
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
            <BookOpen className="h-4 w-4" /> Rules
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
            <Lightbulb className="h-4 w-4" /> Tips
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
          <SkipForward className="h-4 w-4" /> Skip Instructions
        </button>
      )}
    </div>
  );
}
