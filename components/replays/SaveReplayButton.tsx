/**
 * Post-game "Save replay" action (platform expansion §7).
 *
 * Adopting games render this after a run completes. It POSTs the `(seed, inputs)` log to `/api/replays` (where it
 * is re-simulated and scored server-side) and, on success, offers to open the replay or post it: "Post it" opens
 * the composer through `/share` with the game's own result text and the replay link filled in. Saving is the
 * player's choice, never automatic; a signed-out player is told to sign in.
 *
 * Adopting games MUST keep the payload shape in sync with the game's entry in `lib/game/replay.ts` and bump that
 * entry's `version` on any logic change.
 */

import { useRefusalText } from '@/components/errors/useRefusalText';
import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Save, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import type { ReplayData } from '@/lib/game/replay';
import { api } from '@/lib/contract/client';
import { submitReplayApi } from '@/lib/game/replay.contract';
import { replayShareSearch } from '@/lib/game/replay-share';

export interface SaveReplayButtonProps {
  game: string;
  data: ReplayData;
  score?: number | null;
  durationMs: number;
  visibility?: 'public' | 'unlisted';
  /** The post's text, already translated for the player ("Lights Out, 2026-11-22: solved in 9 moves"). */
  shareText?: string;
  disabled?: boolean;
  className?: string;
}

export function SaveReplayButton({
  game,
  data,
  score,
  durationMs,
  visibility,
  shareText,
  disabled,
  className,
}: SaveReplayButtonProps) {
  const { t } = useTranslation('lights-out-replays');
  const refusalText = useRefusalText();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  function shareToFeed(id: string) {
    const origin = typeof window === 'undefined' ? 'https://rmhstudios.com' : window.location.origin;
    void navigate({ to: '/share', search: replayShareSearch({ text: shareText ?? '', origin, id }) });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const json = await api(submitReplayApi, {
        body: {
          game,
          data: data as unknown as Record<string, unknown>,
          score: score ?? undefined,
          durationMs,
          visibility,
        },
      });
      setSavedId(json.id);
      toast.success(t('replay-saved', { defaultValue: 'Replay saved' }));
    } catch (e: unknown) {
      toast.error(refusalText.maybe(e) ?? t('replay-save-failed', { defaultValue: 'Could not save the replay.' }));
    } finally {
      setSaving(false);
    }
  }

  if (!session) {
    return (
      <p className={`t-meta ${className ?? ''}`}>
        <Link to="/login" className="underline">
          {t('replay-sign-in-to-save', { defaultValue: 'Sign in to save a replay' })}
        </Link>
      </p>
    );
  }

  if (savedId) {
    return (
      <div className={className}>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="default" onClick={() => navigate({ to: '/replays/$id', params: { id: savedId } })}>
            <Check aria-hidden />
            {t('replay-view-replay', { defaultValue: 'View replay' })}
          </Button>
          <Button variant="default" onClick={() => shareToFeed(savedId)}>
            {t('replay-post-it', { defaultValue: 'Post it' })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button variant="default" onClick={handleSave} loading={saving} disabled={disabled || saving} className={className}>
      <Save aria-hidden />
      {t('replay-save', { defaultValue: 'Save replay' })}
    </Button>
  );
}
