'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, QrCode, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProfileData } from '@/components/profile/profile-types';
import { LocalTimeChip } from './LocalTime';

// The share card (P10) is a dialog; its code is fetched on first click.
const ProfileCardDialog = lazy(() => import('./ProfileCardDialog'));

/**
 * The identity extras in the profile header (P3, P4, P10): pronouns, a
 * play-on-tap pronunciation clip, the member's local time, and — on your own
 * profile — the share card. Renders nothing for a profile with none of them, and
 * the audio element is not created until the first tap.
 */
export function ProfileIdentityExtras({ profile, name }: { profile: ProfileData; name: string }) {
  const { t } = useTranslation('f-profile-plus');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const clipUrl = profile.pronunciationUrl ?? null;

  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [clipUrl],
  );

  const toggleClip = () => {
    if (!clipUrl) return;
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(clipUrl);
      audio.addEventListener('playing', () => setPlaying(true));
      audio.addEventListener('pause', () => setPlaying(false));
      audio.addEventListener('ended', () => setPlaying(false));
      audioRef.current = audio;
    }
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const hasAny = Boolean(profile.pronouns || clipUrl || profile.timezone || profile.isOwnProfile);
  if (!hasAny) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {profile.pronouns ? (
          <span className="rounded-full bg-site-surface-hover px-2 py-0.5 text-xs font-medium text-site-text-muted">
            {profile.pronouns}
          </span>
        ) : null}
        {clipUrl ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={toggleClip}
            aria-pressed={playing}
            aria-label={
              playing
                ? t('pronunciation-pause', { defaultValue: 'Pause pronunciation' })
                : t('pronunciation-play', {
                    name,
                    defaultValue: 'Hear how to say {{name}}',
                  })
            }
          >
            {playing ? <Pause aria-hidden /> : <Volume2 aria-hidden />}
            {t('pronunciation-label', { defaultValue: 'Pronunciation' })}
          </Button>
        ) : null}
        <LocalTimeChip timezone={profile.timezone} name={name} />
        {profile.isOwnProfile ? (
          <Button variant="ghost" size="xs" onClick={() => setCardOpen(true)}>
            <QrCode aria-hidden />
            {t('share-card', { defaultValue: 'Share card' })}
          </Button>
        ) : null}
      </div>
      {cardOpen ? (
        <Suspense fallback={null}>
          <ProfileCardDialog
            open={cardOpen}
            onOpenChange={setCardOpen}
            handleOrId={profile.handle || profile.id}
          />
        </Suspense>
      ) : null}
    </>
  );
}
