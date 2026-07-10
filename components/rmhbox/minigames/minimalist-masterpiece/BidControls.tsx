/**
 * BidControls — Increment/decrement bid buttons with amount display.
 *
 * The onBid callback receives the new TOTAL bid amount for this drawing.
 * The server expects { drawingId, amount } where amount is the cumulative bid.
 */
'use client';

import { useTranslation } from "react-i18next";

interface BidControlsProps {
  currentBid: number;
  currency: number;
  onBid: (amount: number) => void;
  disabled?: boolean;
}

const INCREMENT = 50;

export default function BidControls({ currentBid, currency, onBid, disabled }: BidControlsProps) {
  const { t } = useTranslation("c-rmhbox");
  const canIncrease = !disabled && currency >= INCREMENT;
  const canDecrease = !disabled && currentBid >= INCREMENT;

  return (
    <div className="flex items-center gap-2">
      <button
        className="w-8 h-8 rounded-full bg-(--rmhbox-border) text-(--rmhbox-text) font-bold disabled:opacity-40"
        onClick={() => onBid(currentBid - INCREMENT)}
        disabled={!canDecrease}
        aria-label={t("decrease-bid", { defaultValue: "Decrease bid" })}
      >
        −
      </button>
      <span className="w-16 text-center text-sm font-mono text-(--rmhbox-text)">
        {currentBid}
      </span>
      <button
        className="w-8 h-8 rounded-full bg-(--rmhbox-accent) text-white font-bold disabled:opacity-40"
        onClick={() => onBid(currentBid + INCREMENT)}
        disabled={!canIncrease}
        aria-label={t("increase-bid", { defaultValue: "Increase bid" })}
      >
        +
      </button>
    </div>
  );
}
