'use client';

import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cardName } from '@/lib/cards/cards';
import type { TradeCard, TradeData, TradeView } from '@/lib/cards/trade-types';
import { CardArt } from './CardArt';
import { CommunityNav } from './CommunityNav';
import { PersonAvatar } from './SteamPeople';
import { tradeErrorText } from './trade-errors';

function CardStrip({ cards }: { cards: TradeCard[] }) {
  const { t } = useTranslation('games-hub');
  if (cards.length === 0) {
    return <span className="stm-muted">{t('steam-trade-nothing', { defaultValue: 'Nothing' })}</span>;
  }
  return (
    <ul className="stm-cardset stm-cardset-tight">
      {cards.map((c) => (
        <li key={`${c.gameId}-${c.cardIndex}-${c.foil}`} title={`${cardName(c.gameId, c.cardIndex)} · ${c.title}`}>
          <CardArt gameId={c.gameId} title={c.title} hue={c.hue} cardIndex={c.cardIndex} foil={c.foil} width={56} />
          {c.qty > 1 ? <span className="stm-cardcount">×{c.qty}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function TradeRow({ trade, actions }: { trade: TradeView; actions?: React.ReactNode }) {
  const { t } = useTranslation('games-hub');
  return (
    <li className="stm-trade">
      <Link
        to="/games/profile/$id"
        params={{ id: trade.partner.handle ?? trade.partner.userId }}
        className="stm-person"
      >
        <PersonAvatar src={trade.partner.image} name={trade.partner.name} />
        <span className="stm-person-name">{trade.partner.name}</span>
      </Link>
      <div className="stm-trade-sides">
        <div>
          <h3 className="stm-subhead">{t('steam-trade-you-give', { defaultValue: 'You give' })}</h3>
          <CardStrip cards={trade.yourCards} />
        </div>
        <div>
          <h3 className="stm-subhead">{t('steam-trade-you-get', { defaultValue: 'You get' })}</h3>
          <CardStrip cards={trade.theirCards} />
        </div>
      </div>
      {actions ? <div className="stm-trade-actions">{actions}</div> : null}
    </li>
  );
}

/** Incoming and outgoing card offers, and the last few that are settled. */
export function TradesPage({ data }: { data: TradeData }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(tradeId: string, action: 'accept' | 'decline' | 'cancel', done: string) {
    setBusy(tradeId);
    try {
      const res = await fetch(`/api/games/trades/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tradeId }),
      });
      if (res.ok) {
        toast.success(done);
        await router.invalidate();
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(tradeErrorText(body.error, t));
        await router.invalidate();
      }
    } catch {
      toast.error(tradeErrorText(undefined, t));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-single">
        <h1 className="stm-web-title">{t('steam-trades', { defaultValue: 'Trade Offers' })}</h1>
        <p className="stm-muted">
          {t('steam-trades-blurb', {
            defaultValue: 'Offer cards to someone you follow or who follows you. Open their profile and choose Trade.',
          })}
        </p>

        <section className="stm-web-card" aria-labelledby="stm-tr-in">
          <h2 id="stm-tr-in" className="stm-web-head">
            {t('steam-trades-incoming', { defaultValue: 'Incoming' })}
            <span className="stm-count">{data.incoming.length}</span>
          </h2>
          {data.incoming.length === 0 ? (
            <p className="stm-web-pad stm-muted">
              {t('steam-trades-none-in', { defaultValue: 'No offers waiting for you.' })}
            </p>
          ) : (
            <ul className="stm-trade-list">
              {data.incoming.map((tr) => (
                <TradeRow
                  key={tr.id}
                  trade={tr}
                  actions={
                    <>
                      <button
                        type="button"
                        className="stm-btn stm-btn-blue"
                        disabled={busy === tr.id}
                        onClick={() =>
                          void act(tr.id, 'accept', t('steam-trade-accepted', { defaultValue: 'Trade complete.' }))
                        }
                      >
                        {t('steam-trade-accept', { defaultValue: 'Accept' })}
                      </button>
                      <button
                        type="button"
                        className="stm-btn"
                        disabled={busy === tr.id}
                        onClick={() =>
                          void act(tr.id, 'decline', t('steam-trade-declined', { defaultValue: 'Offer declined.' }))
                        }
                      >
                        {t('steam-trade-decline', { defaultValue: 'Decline' })}
                      </button>
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <section className="stm-web-card" aria-labelledby="stm-tr-out">
          <h2 id="stm-tr-out" className="stm-web-head">
            {t('steam-trades-outgoing', { defaultValue: 'Outgoing' })}
            <span className="stm-count">{data.outgoing.length}</span>
          </h2>
          {data.outgoing.length === 0 ? (
            <p className="stm-web-pad stm-muted">
              {t('steam-trades-none-out', { defaultValue: 'You have no offers out.' })}
            </p>
          ) : (
            <ul className="stm-trade-list">
              {data.outgoing.map((tr) => (
                <TradeRow
                  key={tr.id}
                  trade={tr}
                  actions={
                    <button
                      type="button"
                      className="stm-btn"
                      disabled={busy === tr.id}
                      onClick={() =>
                        void act(tr.id, 'cancel', t('steam-trade-canceled', { defaultValue: 'Offer withdrawn.' }))
                      }
                    >
                      {t('steam-trade-cancel', { defaultValue: 'Cancel offer' })}
                    </button>
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {data.history.length > 0 ? (
          <section className="stm-web-card" aria-labelledby="stm-tr-hist">
            <h2 id="stm-tr-hist" className="stm-web-head">
              {t('steam-trades-history', { defaultValue: 'Recent' })}
            </h2>
            <ul className="stm-trade-list">
              {data.history.map((tr) => (
                <TradeRow
                  key={tr.id}
                  trade={tr}
                  actions={
                    <span className="stm-muted">
                      {tr.status === 'ACCEPTED'
                        ? t('steam-trade-status-accepted', { defaultValue: 'Accepted' })
                        : tr.status === 'DECLINED'
                          ? t('steam-trade-status-declined', { defaultValue: 'Declined' })
                          : tr.status === 'CANCELED'
                            ? t('steam-trade-status-canceled', { defaultValue: 'Withdrawn' })
                            : t('steam-trade-status-expired', { defaultValue: 'Expired' })}
                    </span>
                  }
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
