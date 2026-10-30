'use client';

import { useMemo, useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cardName } from '@/lib/cards/cards';
import type { MarketData } from '@/lib/cards/market-types';
import { CardArt } from './CardArt';
import { CommunityNav } from './CommunityNav';
import { marketErrorText } from './market-errors';

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error };
  } catch {
    return { ok: false };
  }
}

/** The community market: every card on sale, grouped per card, with Buy lowest. */
export function MarketPage({ data }: { data: MarketData }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const titles = useMemo(
    () => [...new Map(data.groups.map((g) => [g.gameId, g.title])).entries()],
    [data.groups],
  );
  const shown = title ? data.groups.filter((g) => g.gameId === title) : data.groups;

  async function act(id: string, path: string, body: unknown, done: string) {
    setBusy(id);
    const r = await post(path, body);
    setBusy(null);
    if (r.ok) {
      toast.success(done);
      await router.invalidate();
    } else {
      toast.error(marketErrorText(r.error, t));
    }
  }

  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-single">
        <div className="stm-market-head">
          <h1 className="stm-web-title">{t('steam-market', { defaultValue: 'Community Market' })}</h1>
          {data.balance !== null ? (
            <span className="stm-balance">
              <Coins aria-hidden size={16} />
              {t('steam-market-balance', { defaultValue: '{{n}} coins', n: data.balance })}
            </span>
          ) : null}
        </div>
        <p className="stm-muted">
          {t('steam-market-blurb', {
            defaultValue: 'Buy and sell trading cards with RMH coins. A 10% fee is burned on every sale.',
          })}
        </p>

        {data.mine.length > 0 ? (
          <section className="stm-web-card" aria-labelledby="stm-my-listings">
            <h2 id="stm-my-listings" className="stm-web-head">
              {t('steam-my-listings', { defaultValue: 'Your listings' })}
              <span className="stm-count">{data.mine.length}</span>
            </h2>
            <ul className="stm-market-list">
              {data.mine.map((l) => (
                <li key={l.id} className="stm-market-row">
                  <CardArt gameId={l.gameId} title={l.title} hue={l.hue} cardIndex={l.cardIndex} foil={l.foil} width={56} />
                  <span className="stm-person-body">
                    <span className="stm-person-name">{cardName(l.gameId, l.cardIndex)}</span>
                    <span className="stm-person-sub">
                      {l.title} · {t('steam-market-price', { defaultValue: '{{n}} coins', n: l.priceCoins })}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="stm-btn"
                    disabled={busy === l.id}
                    onClick={() =>
                      void act(
                        l.id,
                        '/api/games/market/cancel',
                        { listingId: l.id },
                        t('steam-market-canceled', { defaultValue: 'Listing removed. The card is back in your inventory.' }),
                      )
                    }
                  >
                    {t('steam-market-cancel', { defaultValue: 'Cancel' })}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="stm-web-card" aria-labelledby="stm-for-sale">
          <h2 id="stm-for-sale" className="stm-web-head">
            {t('steam-market-for-sale', { defaultValue: 'For sale' })}
            <label className="stm-market-filter">
              <span className="stm-sr">{t('steam-market-filter', { defaultValue: 'Filter by title' })}</span>
              <select value={title} onChange={(e) => setTitle(e.target.value)} className="stm-input">
                <option value="">{t('steam-market-all', { defaultValue: 'All titles' })}</option>
                {titles.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </h2>
          {shown.length === 0 ? (
            <p className="stm-web-pad stm-muted">
              {t('steam-market-empty', { defaultValue: 'Nothing is for sale yet. List a card from your inventory.' })}
            </p>
          ) : (
            <ul className="stm-market-list">
              {shown.map((g) => {
                const id = g.buyListingId;
                return (
                  <li key={id} className="stm-market-row">
                    <CardArt gameId={g.gameId} title={g.title} hue={g.hue} cardIndex={g.cardIndex} foil={g.foil} width={56} />
                    <span className="stm-person-body">
                      <span className="stm-person-name">
                        {cardName(g.gameId, g.cardIndex)}
                        {g.foil ? ` (${t('steam-market-foil', { defaultValue: 'foil' })})` : ''}
                      </span>
                      <span className="stm-person-sub">
                        {g.title} · {t('steam-market-qty', { defaultValue: 'For sale: {{n}}', n: g.count })}
                      </span>
                    </span>
                    <span className="stm-market-price">
                      {t('steam-market-from', { defaultValue: 'From {{n}} coins', n: g.lowestPrice })}
                    </span>
                    {data.signedIn ? (
                      <button
                        type="button"
                        className="stm-btn stm-btn-blue"
                        disabled={busy === id}
                        onClick={() =>
                          void act(
                            id,
                            '/api/games/market/buy',
                            { listingId: id },
                            t('steam-market-bought', { defaultValue: 'Purchased. The card is in your inventory.' }),
                          )
                        }
                      >
                        {t('steam-market-buy', { defaultValue: 'Buy' })}
                      </button>
                    ) : (
                      <a className="stm-btn stm-btn-blue" href="/login?callbackURL=%2Fgames%2Fmarket">
                        {t('steam-sign-in', { defaultValue: 'Sign in' })}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <p>
          <Link to="/games/inventory" className="stm-link">
            {t('steam-view-inventory', { defaultValue: 'Inventory' })}
          </Link>
        </p>
      </div>
    </div>
  );
}
