/**
 * BidControls — Increment/decrement bid buttons with amount display.
 *
 * The onBid callback receives the new TOTAL bid amount for this drawing.
 * The server expects { drawingId, amount } where amount is the cumulative bid.
 */

import { useTranslation } from 'react-i18next';

interface BidControlsProps {
  currentBid: number;
  currency: number;
  /** Bid step (the host's `bidIncrement` setting, sent by the server). */
  increment: number;
  onBid: (amount: number) => void;
  disabled?: boolean;
}

export default function BidControls({ currentBid, currency, increment, onBid, disabled }: BidControlsProps) {
  const { t } = useTranslation('c-rmhbox');
  const step = increment > 0 ? increment : 50;
  const canIncrease = !disabled && currency >= step;
  const canDecrease = !disabled && currentBid >= step;

  return (
    <div className="flex items-center gap-2">
      <button
        className="w-8 h-8 rounded-full bg-app-border text-app-text font-bold disabled:opacity-40"
        onClick={() => onBid(currentBid - step)}
        disabled={!canDecrease}
        aria-label={t('decrease-bid', {
          defaultValue: 'Decrease bid',
        })}
      >
        −
      </button>
      <span className="w-16 text-center text-sm font-mono text-app-text">{currentBid}</span>
      <button
        className="w-8 h-8 rounded-full bg-app-accent text-app-accent-fg font-bold disabled:opacity-40"
        onClick={() => onBid(currentBid + step)}
        disabled={!canIncrease}
        aria-label={t('increase-bid', {
          defaultValue: 'Increase bid',
        })}
      >
        +
      </button>
    </div>
  );
}
