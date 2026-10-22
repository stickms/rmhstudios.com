'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

// Discussion and the devil's-advocate button load only when a card is opened.
const MarketPanel = lazy(() => import('./MarketPanel').then((m) => ({ default: m.MarketPanel })));

interface Props {
  marketId: string;
  signedIn: boolean;
  /** The side the viewer holds, if any. */
  held: 'YES' | 'NO' | null;
}

export function MarketExtras({ marketId, signedIn, held }: Props) {
  const { t } = useTranslation('f-forecasting');
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 self-start text-xs text-site-text-dim hover:text-site-text transition-colors"
      >
        <MessageSquare className="w-3.5 h-3.5" aria-hidden />
        {open
          ? t('hide', { defaultValue: 'Hide discussion' })
          : t('discuss', { defaultValue: 'Discuss' })}
      </button>
      {open && (
        <Suspense fallback={<Spinner />}>
          <MarketPanel marketId={marketId} signedIn={signedIn} held={held} />
        </Suspense>
      )}
    </div>
  );
}
