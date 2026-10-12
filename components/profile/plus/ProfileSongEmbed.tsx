'use client';

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

/**
 * The profile song's Spotify embed (P7) — mounted only after a visitor taps the
 * vinyl on a profile whose song has no preview clip, so Spotify's iframe is
 * never requested for someone who just looked at the page. The visitor presses
 * play inside Spotify's own player; nothing starts by itself.
 */
const TRACK_ID = /^[A-Za-z0-9]{10,32}$/;

export default function ProfileSongEmbed({
  spotifyId,
  title,
  onClose,
}: {
  spotifyId: string;
  title: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('f-profile-plus');
  if (!TRACK_ID.test(spotifyId)) return null;
  return (
    <aside
      className="glass-overlay fixed inset-x-3 bottom-24 z-40 mx-auto max-w-sm rounded-site p-2 sm:right-4 sm:left-auto sm:mx-0"
      aria-label={t('song-embed-label', { defaultValue: 'Profile song player' })}
    >
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <p className="min-w-0 truncate text-xs font-medium text-site-text-muted">
          {title ?? t('song-embed-title', { defaultValue: 'Profile song' })}
        </p>
        <IconButton
          icon={X}
          size="icon-xs"
          variant="ghost"
          onClick={onClose}
          label={t('song-embed-close', { defaultValue: 'Close player' })}
        />
      </div>
      <iframe
        title={t('song-embed-frame', { defaultValue: 'Spotify player' })}
        src={`https://open.spotify.com/embed/track/${spotifyId}`}
        width="100%"
        height="80"
        loading="lazy"
        allow="encrypted-media"
        className="block rounded-site-sm border-0"
      />
    </aside>
  );
}
