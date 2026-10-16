'use client';

import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { emit } from '@/lib/rmhmusic/socket';
import { C2S } from '@/lib/rmhmusic/events';
import { RADIO_CODE } from '@/lib/rmhmusic/constants';

/** T4 — one tap into the always-on community radio room. */
export default function RadioJoinCard() {
  const { t } = useTranslation('f-creative');
  const connected = useRmhMusicStore((s) => s.connectionStatus === 'connected');
  return (
    <div
      className="mt-4 flex items-center justify-between gap-3 rounded-xl p-4"
      style={{ background: 'color-mix(in srgb, var(--app-surface) 80%, transparent)' }}
    >
      <div>
        <h3
          className="flex items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--app-text)' }}
        >
          <Radio className="h-4 w-4" aria-hidden />
          {t('radio-title', { defaultValue: 'Community radio' })}
        </h3>
        <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {t('radio-desc', {
            defaultValue: 'Always on. Take the decks in the DJ rotation or just listen and vote.',
          })}
        </p>
      </div>
      <button
        type="button"
        disabled={!connected}
        onClick={() => emit(C2S.ROOM_JOIN, { code: RADIO_CODE })}
        className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40"
        style={{ background: 'var(--app-accent)', color: 'var(--app-bg)' }}
      >
        {t('radio-tune-in', { defaultValue: 'Tune in' })}
      </button>
    </div>
  );
}
