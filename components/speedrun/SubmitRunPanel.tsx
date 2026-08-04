'use client';

/**
 * Submit one of your own replays to a board.
 *
 * The form carries no time and no score — only *which recording*. Everything
 * ranked is read off the replay row and re-derived by the verifier, so there is
 * nothing here for a client to inflate. What the panel does owe the runner is a
 * clear reason when a replay cannot be submitted, which is why each replay shows
 * the game version it was recorded on and whether a board is open for it.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { formatRunTime } from '@/lib/speedrun/versions';

interface SubmittableReplay {
  id: string;
  version: string;
  score: number | null;
  durationMs: number;
  createdAt: string;
}

interface SubmitRunPanelProps {
  game: string;
  slug: string;
  /** Versions this category has an open board for. */
  openVersions: string[];
  onSubmitted: () => void;
}

export function SubmitRunPanel({ game, slug, openVersions, onSubmitted }: SubmitRunPanelProps) {
  const { t } = useTranslation('c-tournaments');
  const [replays, setReplays] = useState<SubmittableReplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/speedrun/replays?game=${encodeURIComponent(game)}`);
      const data = (await res.json().catch(() => ({ replays: [] }))) as {
        replays?: SubmittableReplay[];
      };
      setReplays(res.ok ? (data.replays ?? []) : []);
    } finally {
      setLoading(false);
    }
  }, [game]);

  useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/speedrun/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, slug, replayId: selected }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        verdict?: { status: string; message: string | null };
      };
      if (!res.ok) {
        toast.error(
          data.error ?? t('speedrun-submit-failed', { defaultValue: 'Could not submit that run' }),
        );
        return;
      }
      if (data.verdict?.status === 'verified') {
        toast.success(t('speedrun-submit-verified', { defaultValue: 'Run verified and ranked' }));
      } else if (data.verdict?.status === 'rejected') {
        toast.error(
          data.verdict.message ?? t('speedrun-submit-rejected', { defaultValue: 'Run rejected' }),
        );
      } else {
        toast.success(
          t('speedrun-submit-queued', { defaultValue: 'Run submitted — it is in review' }),
        );
      }
      setSelected(null);
      await load();
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card pane className="px-5 sm:px-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-medium text-site-text">
          {t('speedrun-submit-title', { defaultValue: 'Submit a run' })}
        </h2>

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : replays.length === 0 ? (
          <p className="text-sm text-site-text-muted">
            {t('speedrun-submit-none', {
              defaultValue:
                'No unsubmitted recordings for this game. Finish a run with replay capture on and it will appear here.',
            })}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {replays.map((replay) => {
              const boardOpen = openVersions.includes(replay.version);
              const isSelected = selected === replay.id;
              return (
                <li key={replay.id}>
                  <button
                    type="button"
                    disabled={!boardOpen}
                    onClick={() => setSelected(isSelected ? null : replay.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'glass-fill flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-site px-3 py-2 text-left transition-colors',
                      isSelected && 'ring-1 ring-site-accent',
                      !boardOpen && 'opacity-60',
                    )}
                  >
                    <span className="font-mono text-sm tabular-nums text-site-text">
                      {formatRunTime(replay.durationMs)}
                    </span>
                    {replay.score !== null && (
                      <span className="font-mono text-sm tabular-nums text-site-text-muted">
                        {replay.score}
                      </span>
                    )}
                    <Badge variant="outline" size="sm">
                      {replay.version}
                    </Badge>
                    {!boardOpen && (
                      <span className="text-xs text-site-text-dim">
                        {t('speedrun-no-board-for-version', {
                          defaultValue: 'No board open for this version',
                        })}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Button onClick={submit} disabled={!selected || submitting} loading={submitting}>
          <Upload className="size-4" aria-hidden />
          {t('speedrun-submit-action', { defaultValue: 'Submit selected run' })}
        </Button>
      </div>
    </Card>
  );
}
