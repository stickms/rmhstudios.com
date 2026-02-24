/**
 * AuctionPanel — Displays drawings with bid controls during the auction phase.
 *
 * Self-bid is disabled (players cannot bid on their own drawings).
 */
'use client';

import DrawingCard from './DrawingCard';
import BidControls from './BidControls';
import type { MMStroke } from './DrawingCard';

interface AuctionDrawing {
  drawingId: string;
  label: string;
  strokes: MMStroke[];
  currentBidTotal: number;
  myBidAmount: number;
  isMine: boolean;
}

interface AuctionPanelProps {
  drawings: AuctionDrawing[];
  currency: number;
  onBid: (drawingId: string, amount: number) => void;
}

export default function AuctionPanel({ drawings, currency, onBid }: AuctionPanelProps) {
  if (drawings.length === 0) {
    return (
      <p className="text-sm text-(--rmhbox-text-muted)">No drawings available.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
      {drawings.map((drawing) => (
        <div
          key={drawing.drawingId}
          className={`flex flex-col items-center gap-2 p-3 rounded-lg border ${
            drawing.isMine
              ? 'border-(--rmhbox-text-muted) opacity-60'
              : 'border-(--rmhbox-border)'
          }`}
        >
          <DrawingCard strokes={drawing.strokes} label={drawing.label} />
          <p className="text-xs text-(--rmhbox-text-muted)">
            Market value: {drawing.currentBidTotal}
          </p>
          {drawing.isMine ? (
            <span className="text-xs text-(--rmhbox-text-muted) italic">Your drawing</span>
          ) : (
            <BidControls
              currentBid={drawing.myBidAmount}
              currency={currency}
              onBid={(amount) => onBid(drawing.drawingId, amount)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
