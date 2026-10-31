/**
 * The hub (signalling) connection as one quiet chip in the /balatro toolbar.
 * Peers keep playing over their direct channels when the hub drops, so this is
 * information, not an alarm; the in-game Multiplayer panel carries the detail.
 */
'use client';

import { Loader2, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MpViewState } from '@/lib/balatro/mp/pack-loader';

export function ConnectionChip({ hub }: { hub: MpViewState['hub'] }) {
  const { t } = useTranslation('c-balatro');
  if (!hub) return null;
  const label =
    hub === 'connected'
      ? t('mp_hub_connected', { defaultValue: 'Online' })
      : hub === 'connecting'
        ? t('mp_hub_connecting', { defaultValue: 'Connecting' })
        : t('mp_hub_offline', { defaultValue: 'Offline' });
  const Icon = hub === 'connected' ? Wifi : hub === 'connecting' ? Loader2 : WifiOff;
  return (
    <span className="balatro-mp-chip" data-state={hub} role="status" aria-live="polite">
      <Icon className={hub === 'connecting' ? 'app-spin size-3.5' : 'size-3.5'} aria-hidden />
      <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
    </span>
  );
}
