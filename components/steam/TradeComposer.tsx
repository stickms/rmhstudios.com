'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cardName } from '@/lib/cards/cards';
import { MAX_CARDS_PER_SIDE, MAX_QTY_PER_CARD } from '@/lib/cards/trade-rules';
import type { TradeCard, TradeInventories } from '@/lib/cards/trade-types';
import type { PersonRef } from '@/lib/games/community-types';
import { CardArt } from './CardArt';
import { CommunityNav } from './CommunityNav';
import { tradeErrorText } from './trade-errors';

const keyOf = (c: TradeCard) => `${c.gameId}|${c.cardIndex}|${c.foil}`;

function Picker({
  heading,
  cards,
  picked,
  onChange,
}: {
  heading: string;
  cards: TradeCard[];
  picked: Record<string, number>;
  onChange: (key: string, qty: number) => void;
}) {
  const { t } = useTranslation('games-hub');
  const distinct = Object.values(picked).filter((n) => n > 0).length;
  return (
    <section className="stm-web-card">
      <h2 className="stm-web-head">
        {heading}
        <span className="stm-count">{distinct}</span>
      </h2>
      {cards.length === 0 ? (
        <p className="stm-web-pad stm-muted">{t('steam-trade-no-cards', { defaultValue: 'No trading cards.' })}</p>
      ) : (
        <ul className="stm-cardset">
          {cards.map((c) => {
            const k = keyOf(c);
            const n = picked[k] ?? 0;
            const cap = Math.min(c.qty, MAX_QTY_PER_CARD);
            return (
              <li key={k} className="stm-pick" data-picked={n > 0 ? 'true' : undefined}>
                <CardArt gameId={c.gameId} title={c.title} hue={c.hue} cardIndex={c.cardIndex} foil={c.foil} width={88} />
                <div className="stm-pick-ctl">
                  <button
                    type="button"
                    className="stm-btn"
                    aria-label={t('steam-trade-less', { defaultValue: 'Remove one {{name}}', name: cardName(c.gameId, c.cardIndex) })}
                    disabled={n === 0}
                    onClick={() => onChange(k, n - 1)}
                  >
                    <Minus aria-hidden size={14} />
                  </button>
                  <span aria-live="polite">
                    {n}/{c.qty}
                  </span>
                  <button
                    type="button"
                    className="stm-btn"
                    aria-label={t('steam-trade-more', { defaultValue: 'Add one {{name}}', name: cardName(c.gameId, c.cardIndex) })}
                    disabled={n >= cap || (n === 0 && distinct >= MAX_CARDS_PER_SIDE)}
                    onClick={() => onChange(k, n + 1)}
                  >
                    <Plus aria-hidden size={14} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Build an offer: choose cards from your stacks and theirs, then send it. */
export function TradeComposer({
  partner,
  inventories,
}: {
  partner: PersonRef;
  inventories: TradeInventories;
}) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [give, setGive] = useState<Record<string, number>>({});
  const [ask, setAsk] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const count = (m: Record<string, number>) => Object.values(m).reduce((n, q) => n + q, 0);

  const toItems = (cards: TradeCard[], picked: Record<string, number>) =>
    cards
      .filter((c) => (picked[keyOf(c)] ?? 0) > 0)
      .map((c) => ({ gameId: c.gameId, cardIndex: c.cardIndex, foil: c.foil, qty: picked[keyOf(c)] }));

  async function send() {
    setBusy(true);
    try {
      const res = await fetch('/api/games/trades/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          toId: partner.userId,
          give: toItems(inventories.mine, give),
          ask: toItems(inventories.theirs, ask),
        }),
      });
      if (res.ok) {
        toast.success(t('steam-trade-sent', { defaultValue: 'Offer sent.' }));
        await router.navigate({ to: '/games/trades' });
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(tradeErrorText(body.error, t));
      }
    } catch {
      toast.error(tradeErrorText(undefined, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-single">
        <h1 className="stm-web-title">
          {t('steam-trade-with', { defaultValue: 'Trade with {{name}}', name: partner.name })}
        </h1>
        <Picker
          heading={t('steam-trade-you-give', { defaultValue: 'You give' })}
          cards={inventories.mine}
          picked={give}
          onChange={(k, q) => setGive((p) => ({ ...p, [k]: q }))}
        />
        <Picker
          heading={t('steam-trade-you-get', { defaultValue: 'You get' })}
          cards={inventories.theirs}
          picked={ask}
          onChange={(k, q) => setAsk((p) => ({ ...p, [k]: q }))}
        />
        <p>
          <button
            type="button"
            className="stm-btn stm-btn-blue"
            disabled={busy || count(give) + count(ask) === 0}
            onClick={() => void send()}
          >
            {t('steam-trade-send', { defaultValue: 'Send offer' })}
          </button>
        </p>
        <p className="stm-muted">
          {t('steam-trade-note', {
            defaultValue: 'Nothing moves until they accept. The offer expires in 14 days.',
          })}
        </p>
      </div>
    </div>
  );
}
