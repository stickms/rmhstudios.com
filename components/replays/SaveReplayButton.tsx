/**
 * Post-game "Save replay" action (platform expansion §7).
 *
 * Adopting games render this after a run completes. It POSTs the
 * `(seed, inputs)` log to `/api/replays` (where it is re-simulated and scored
 * server-side) and, on success, surfaces share affordances: view the replay, or
 * share it to the feed. v1 "share to feed" copies the replay link and opens the
 * composer — a full composer prefill is future work.
 *
 * Adopting games MUST keep the payload shape in sync with the game's entry in
 * `lib/game/replay.ts` and bump that entry's `version` on any logic change.
 */

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Save, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import type { ReplayData } from '@/lib/game/replay';

export interface SaveReplayButtonProps {
  game: string;
  data: ReplayData;
  score?: number | null;
  durationMs: number;
  visibility?: 'public' | 'unlisted';
  disabled?: boolean;
  className?: string;
}

export function SaveReplayButton({
  game,
  data,
  score,
  durationMs,
  visibility,
  disabled,
  className,
}: SaveReplayButtonProps) {
  const { t } = useTranslation('site');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function shareToFeed(id: string) {
    const url = `https://rmhstudios.com/replays/${id}`;
    try {
      await navigator.clipboard?.writeText(url);
      toast.success(
        t('replay-link-copied', { defaultValue: 'Replay link copied — paste it into a new post.' }),
      );
    } catch {
      /* clipboard may be unavailable; still navigate to the feed */
    }
    navigate({ to: '/' });
  }

  async function handleSave() {
    if (!session) {
      toast.error(t('replay-sign-in-to-save', { defaultValue: 'Sign in to save replays.' }));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/replays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, data, score: score ?? undefined, durationMs, visibility }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json?.error ?? t('replay-save-failed', { defaultValue: 'Could not save replay.' }));
        return;
      }
      setSavedId(json.id);
      toast.success(t('replay-saved', { defaultValue: 'Replay saved!' }), {
        action: {
          label: t('replay-view', { defaultValue: 'View' }),
          onClick: () => navigate({ to: '/replays/$id', params: { id: json.id } }),
        },
      });
    } catch {
      toast.error(t('replay-save-failed', { defaultValue: 'Could not save replay.' }));
    } finally {
      setSaving(false);
    }
  }

  if (savedId) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate({ to: '/replays/$id', params: { id: savedId } })}
          >
            <Check aria-hidden />
            {t('replay-view-replay', { defaultValue: 'View replay' })}
          </Button>
          <Button variant="accent-outline" onClick={() => shareToFeed(savedId)}>
            {t('replay-share-to-feed', { defaultValue: 'Share to feed' })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      onClick={handleSave}
      loading={saving}
      disabled={disabled || saving}
      className={className}
    >
      <Save aria-hidden />
      {t('replay-save', { defaultValue: 'Save replay' })}
    </Button>
  );
}
