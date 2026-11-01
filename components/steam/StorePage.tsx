'use client';

import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search, Star, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StoreCard, StoreData } from '@/lib/games/store-types';
import { TitleArt } from './TitleArt';

function Capsules({ items }: { items: StoreCard[] }) {
  const { t } = useTranslation('games-hub');
  return (
    <ul className="stm-capsules stm-web-pad">
      {items.map((c) => (
        <li key={c.id}>
          <Link to="/games/$gameId" params={{ gameId: c.id }} className="stm-capsule">
            <TitleArt build={c} width={240} height={360} />
            <span className="stm-capsule-name">{c.title}</span>
            <span className="stm-capsule-sub">
              {c.rating ? (
                <>
                  <Star aria-hidden size={12} className="stm-inline-icon" />
                  {c.rating.average.toFixed(1)}
                  {' · '}
                </>
              ) : null}
              {c.players > 0
                ? t('steam-store-players', { defaultValue: 'Players: {{n}}', n: c.players })
                : c.kind === 'app'
                  ? t('steam-kind-app', { defaultValue: 'App' })
                  : t('steam-kind-game', { defaultValue: 'Game' })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The Store: discovery for the catalog. Nothing here costs money. */
export function StorePage({ data }: { data: StoreData }) {
  const { t } = useTranslation('games-hub');
  const navigate = useNavigate();
  const [q, setQ] = useState(data.q ?? '');
  const [hero, ...rest] = data.featured;

  return (
    <div className="stm-web">
      <div className="stm-web-single">
        <div className="stm-market-head">
          <h1 className="stm-web-title">{t('steam-nav-store', { defaultValue: 'Store' })}</h1>
          <Link to="/games/shop" className="stm-link">
            {t('steam-store-coin-shop', { defaultValue: 'Coin shop' })}
          </Link>
        </div>

        <form
          className="stm-store-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ to: '/games/store', search: q.trim() ? { q: q.trim() } : {} });
          }}
        >
          <label>
            <span className="stm-sr">{t('steam-search', { defaultValue: 'Search games and apps' })}</span>
            <Search aria-hidden size={16} />
            <input
              type="search"
              className="stm-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('steam-search', { defaultValue: 'Search games and apps' })}
            />
          </label>
        </form>

        <nav className="stm-tagchips" aria-label={t('steam-store-tags', { defaultValue: 'Browse by tag' })}>
          {data.tags.map((x) => (
            <Link
              key={x.tag}
              to="/games/store"
              search={{ tag: x.tag }}
              aria-current={data.tag?.toLowerCase() === x.tag.toLowerCase() ? 'page' : undefined}
            >
              {x.tag} <span>{x.count}</span>
            </Link>
          ))}
        </nav>

        {data.results ? (
          <section className="stm-web-card" aria-labelledby="stm-store-results">
            <h2 id="stm-store-results" className="stm-web-head">
              {data.tag
                ? t('steam-store-tagged', { defaultValue: 'Tagged: {{tag}}', tag: data.tag })
                : t('steam-store-results', { defaultValue: 'Results for “{{q}}”', q: data.q })}
              <span className="stm-count">{data.results.length}</span>
            </h2>
            {data.results.length === 0 ? (
              <p className="stm-web-pad stm-muted">{t('steam-empty', { defaultValue: 'Nothing matches that search.' })}</p>
            ) : (
              <Capsules items={data.results} />
            )}
            <p className="stm-web-pad">
              <Link to="/games/store" className="stm-link">
                {t('steam-store-clear', { defaultValue: 'Back to the Store' })}
              </Link>
            </p>
          </section>
        ) : (
          <>
            {hero ? (
              <section className="stm-web-card" aria-labelledby="stm-store-featured">
                <h2 id="stm-store-featured" className="stm-web-head">
                  {t('steam-store-featured', { defaultValue: 'Featured & Recommended' })}
                </h2>
                <div className="stm-store-hero">
                  <Link to="/games/$gameId" params={{ gameId: hero.id }} className="stm-store-hero-art">
                    <TitleArt build={hero} width={320} height={480} />
                  </Link>
                  <div className="stm-store-hero-body">
                    <h3>
                      <Link to="/games/$gameId" params={{ gameId: hero.id }}>
                        {hero.title}
                      </Link>
                    </h3>
                    <p>{hero.description}</p>
                    <ul className="stm-tags" aria-label={t('steam-tags', { defaultValue: 'Tags' })}>
                      {hero.tags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                    <p className="stm-muted stm-store-meta">
                      {hero.players > 0 ? (
                        <>
                          <Users aria-hidden size={14} className="stm-inline-icon" />
                          {t('steam-store-players', { defaultValue: 'Players: {{n}}', n: hero.players })}
                        </>
                      ) : null}
                      {hero.rating ? (
                        <>
                          {hero.players > 0 ? ' · ' : ''}
                          <Star aria-hidden size={14} className="stm-inline-icon" />
                          {hero.rating.average.toFixed(1)} ({hero.rating.count})
                        </>
                      ) : null}
                    </p>
                    <div className="stm-store-hero-actions">
                      <Link to="/games/$gameId" params={{ gameId: hero.id }} className="stm-btn stm-btn-blue">
                        {t('steam-store-view', { defaultValue: 'View in Library' })}
                      </Link>
                      <Link to="/games/hub/$gameId" params={{ gameId: hero.id }} className="stm-btn">
                        {t('steam-hub-heading', { defaultValue: 'Community Hub' })}
                      </Link>
                    </div>
                  </div>
                </div>
                {rest.length > 0 ? <Capsules items={rest} /> : null}
              </section>
            ) : null}

            {data.trending.length > 0 ? (
              <section className="stm-web-card" aria-labelledby="stm-store-trending">
                <h2 id="stm-store-trending" className="stm-web-head">
                  {t('steam-store-trending', { defaultValue: 'New & Trending' })}
                </h2>
                <Capsules items={data.trending} />
              </section>
            ) : null}

            {data.topRated.length > 0 ? (
              <section className="stm-web-card" aria-labelledby="stm-store-top">
                <h2 id="stm-store-top" className="stm-web-head">
                  {t('steam-store-top-rated', { defaultValue: 'Top Rated' })}
                </h2>
                <Capsules items={data.topRated} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
