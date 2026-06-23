/**
 * AuctionPanel — Displays drawings with bid controls during the auction phase.
 *
 * Self-bid is disabled (players cannot bid on their own drawings).
 */
'use client';

import { useTranslation } from "react-i18next";
import DrawingCard from './DrawingCard';
import BidControls from './BidControls';
import type { MMStroke } from './DrawingCard';

interface AuctionDrawing {
  drawingId: string;
  label: string;
  strokes: MMStroke[];
  backgroundColor?: string;
  currentBidTotal: number;
  myBidAmount: number;
  isMine: boolean;
}

interface AuctionPanelProps {
  drawings: AuctionDrawing[];
  currency: number;
  onBid: (drawingId: string, amount: number) => void;
  disabled?: boolean;
}

export default function AuctionPanel({ drawings, currency, onBid, disabled }: AuctionPanelProps) {
  const { t } = useTranslation("c-rmhbox");

  if (drawings.length === 0) {
    return (
      <p className="text-sm text-(--rmhbox-text-muted)">{t("no-drawings-available", { defaultValue: "No drawings available." })}</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl">
      {drawings.map((drawing) => (
        <div
          key={drawing.drawingId}
          className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${
            drawing.isMine
              ? 'border-(--rmhbox-text-muted) opacity-60'
              : 'border-(--rmhbox-border)'
          }`}
        >
          <DrawingCard strokes={drawing.strokes} backgroundColor={drawing.backgroundColor} label={drawing.label} />
          {drawing.isMine ? (
            <span className="text-xs text-(--rmhbox-text-muted) italic">{t("your-drawing", { defaultValue: "Your drawing" })}</span>
          ) : (
            <BidControls
              currentBid={drawing.myBidAmount}
              currency={currency}
              onBid={(amount) => onBid(drawing.drawingId, amount)}
              disabled={disabled}
            />
          )}
        </div>
      ))}
    </div>
  );
}
