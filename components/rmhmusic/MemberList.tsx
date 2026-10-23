'use client';

import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';

export default function MemberList() {
  const { t } = useTranslation("c-rmhmusic");
  const { room } = useRmhMusicStore();
  if (!room) return null;

  return (
    <div className="px-3 py-2 border-b" style={{ borderColor: 'color-mix(in srgb, var(--app-text) 10%, transparent)' }}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Users className="w-3.5 h-3.5" style={{ color: 'var(--app-text-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {t("listener-count", { count: room.members.length, defaultValue: "{{count}} listener" })}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {room.members.map((m) => (
          <div
            key={m.userId}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
            style={{ background: 'var(--app-surface)', color: m.isConnected ? 'var(--app-text)' : 'var(--app-text-dim)' }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: m.isConnected ? 'var(--app-success)' : 'var(--app-text-dim)' }}
            />
            {m.userName}
            {m.isHost && (
              <span className="text-xs font-semibold" style={{ color: 'var(--app-accent)' }}>{t("host-label", { defaultValue: "HOST" })}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
