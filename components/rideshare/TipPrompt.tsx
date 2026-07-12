'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, Loader2, Heart } from 'lucide-react';
import {
  TIP_PERCENTS,
  suggestedTipCents,
  MAX_TIP_CENTS,
  formatUsd,
} from '@/lib/rideshare/geo';

interface TipPromptProps {
  fareCents: number;
  /** A tip already left for this trip (cents). When > 0 we show a thank-you. */
  tipCents: number;
  onTip: (cents: number) => Promise<void>;
}

/**
 * Post-trip tipping for riders. 100% of a tip goes to the driver. Shows preset
 * percentages plus a custom amount, or a thank-you once a tip is recorded.
 */
export function TipPrompt({ fareCents, tipCents, onTip }: TipPromptProps) {
  const { t } = useTranslation("c-rideshare");
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (tipCents > 0) {
    return (
      <div className="rounded-2xl border border-site-success/30 bg-site-success/10 p-5 text-center">
        <Heart className="mx-auto h-7 w-7 fill-site-success text-site-success" />
        <h3 className="mt-2 font-semibold text-site-text">
          {t("you-tipped", { defaultValue: "You tipped {{amount}}", amount: formatUsd(tipCents) })}
        </h3>
        <p className="mt-1 text-sm text-site-text-muted">
          {t("driver-gets-all-thanks", { defaultValue: "Your driver gets 100% of it. Thanks for the love!" })}
        </p>
      </div>
    );
  }

  const customCents = Math.round(parseFloat(custom || '0') * 100);
  const amount = selected ?? (customCents > 0 ? customCents : 0);
  const valid = amount > 0 && amount <= MAX_TIP_CENTS;

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    try {
      await onTip(amount);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-site-border bg-site-surface/80 p-5">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-site-accent" />
        <h3 className="font-semibold text-site-text">{t("add-tip-header", { defaultValue: "Add a tip for your driver" })}</h3>
      </div>
      <p className="mt-1 text-sm text-site-text-muted">
        {t("tip-goes-to-driver", { defaultValue: "100% of your tip goes straight to your driver." })}
      </p>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {TIP_PERCENTS.map((pct) => {
          const cents = suggestedTipCents(fareCents, pct);
          const active = selected === cents && custom === '';
          return (
            <button
              key={pct}
              type="button"
              onClick={() => {
                setSelected(cents);
                setCustom('');
              }}
              className={`rounded-lg border px-2 py-2.5 text-center transition-colors ${
                active
                  ? 'border-site-accent bg-site-accent/10 text-site-accent'
                  : 'border-site-border bg-site-surface text-site-text hover:border-site-border-bright'
              }`}
            >
              <div className="text-sm font-semibold">{pct === 0 ? t("no-tip", { defaultValue: "No tip" }) : `${Math.round(pct * 100)}%`}</div>
              {pct > 0 && <div className="text-[11px] text-site-text-dim">{formatUsd(cents)}</div>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-site-text-dim">$</span>
          <input
            type="number"
            min={0}
            step="0.50"
            inputMode="decimal"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setSelected(null);
            }}
            placeholder={t("custom-amount-placeholder", { defaultValue: "Custom amount" })}
            className="w-full rounded-lg border border-site-border bg-site-surface py-2.5 pl-7 pr-3 text-sm text-site-text outline-none transition-colors placeholder:text-site-text-dim focus:border-site-accent/60"
          />
        </div>
        <button
          onClick={submit}
          disabled={!valid || submitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-site-accent px-5 py-2.5 text-sm font-semibold text-(--site-accent-fg) transition-colors hover:bg-(--site-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          {amount > 0 ? t("tip-with-amount", { defaultValue: "Tip {{amount}}", amount: formatUsd(amount) }) : t("tip-label", { defaultValue: "Tip" })}
        </button>
      </div>
    </div>
  );
}
