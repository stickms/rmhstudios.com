'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, Grid3x3, MessageSquareText, Mic, Swords, X } from 'lucide-react';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import PredictTab from './PredictTab';
import BingoTab from './BingoTab';
import LaterTab from './LaterTab';
import NotesTab from './NotesTab';
import TrackTab from './TrackTab';

type Tab = 'predict' | 'bingo' | 'later' | 'notes' | 'track';

export default function WatchPartyPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('f-watch');
  const [tab, setTab] = useState<Tab>('predict');
  const tabs = [
    { id: 'predict', label: t('tab-predict', { defaultValue: 'Predict' }), icon: Swords },
    { id: 'bingo', label: t('tab-bingo', { defaultValue: 'Bingo' }), icon: Grid3x3 },
    { id: 'later', label: t('tab-later', { defaultValue: 'Later' }), icon: Bookmark },
    { id: 'notes', label: t('tab-notes', { defaultValue: 'Notes' }), icon: MessageSquareText },
    { id: 'track', label: t('tab-track', { defaultValue: 'Track' }), icon: Mic },
  ];
  return (
    <div
      role="dialog"
      aria-label={t('party-title', { defaultValue: 'Watch party games' })}
      className="fixed right-3 top-16 z-50 flex max-h-[min(36rem,calc(100dvh-5rem))] w-[min(26rem,calc(100vw-1.5rem))] flex-col rounded-(--app-radius) border border-(--app-border) bg-(--app-surface) shadow-(--app-shadow)"
    >
      <div className="flex items-center justify-between gap-2 border-b border-(--app-border) p-2">
        <LiquidTabs
          tabs={tabs}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          size="sm"
          iconOnly
          sheet={false}
          aria-label={t('party-title', { defaultValue: 'Watch party games' })}
        />
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-(--app-text-muted) hover:text-(--app-text)"
          title={t('close', { defaultValue: 'Close' })}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm text-(--app-text)">
        {tab === 'predict' && <PredictTab />}
        {tab === 'bingo' && <BingoTab />}
        {tab === 'later' && <LaterTab />}
        {tab === 'notes' && <NotesTab />}
        {tab === 'track' && <TrackTab />}
      </div>
    </div>
  );
}
