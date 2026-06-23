'use client';

import { Plus, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@/lib/rmhmusic/utils';

interface TrackCardProps {
  uri: string;
  title: string;
  artist: string;
  albumArt: string | null;
  durationMs: number;
  album?: string;
  onPlay?: () => void;
  onAddToQueue?: () => void;
}

export default function TrackCard({ uri, title, artist, albumArt, durationMs, album, onPlay, onAddToQueue }: TrackCardProps) {
  const { t } = useTranslation("c-rmhmusic");
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg transition-colors group cursor-pointer"
      style={{ '--hover-bg': 'color-mix(in srgb, var(--site-text) 8%, transparent)' } as any}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'color-mix(in srgb, var(--site-text) 8%, transparent)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      onClick={onPlay}
    >
      <div className="relative w-10 h-10 rounded shrink-0 overflow-hidden">
        {albumArt ? (
          <img src={albumArt} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--site-surface)' }}>
            <Play className="w-4 h-4" style={{ color: 'var(--site-text-muted)' }} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play className="w-4 h-4 text-white" />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--site-text)' }}>{title}</p>
        <p className="text-xs truncate" style={{ color: 'var(--site-text-muted)' }}>{artist}{album ? ` · ${album}` : ''}</p>
      </div>

      <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--site-text-dim)' }}>
        {formatDuration(durationMs)}
      </span>

      {onAddToQueue && (
        <button
          onClick={(e) => { e.stopPropagation(); onAddToQueue(); }}
          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: 'var(--site-accent)' }}
          title={t("add-to-queue", { defaultValue: "Add to queue" })}
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
