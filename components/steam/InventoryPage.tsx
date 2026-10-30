'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MAX_BADGE_LEVEL } from '@/lib/cards/cards';
import type { InventoryData } from '@/lib/cards/types';
import { CardArt } from './CardArt';
import { CommunityNav } from './CommunityNav';
import { GemsPanel } from './GemsPanel';
import { SellCard } from './SellCard';
import { UnpackCard } from './UnpackCard';

/** The signed-in user's trading cards and badges, grouped by title, as Steam's inventory. */
export function InventoryPage({ data }: { data: InventoryData }) {
  const { t } = useTranslation('games-hub');
  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-single">
        <h1 className="stm-web-title">{t('steam-inventory', { defaultValue: 'Inventory' })}</h1>
        <GemsPanel gems={data.gems} coins={data.coins} packTitles={data.packTitles} />
        {data.groups.length === 0 ? (
          <section className="stm-web-card">
            <p className="stm-web-pad stm-muted">
              {t('steam-inventory-empty', {
                defaultValue:
                  'No trading cards yet. Play a game for 30 minutes and a card will drop.',
              })}
            </p>
            <p className="stm-web-pad">
              <Link to="/games" className="stm-link">
                {t('steam-back-to-library', { defaultValue: 'Back to the library' })}
              </Link>
            </p>
          </section>
        ) : (
          <>
            <p className="stm-muted">
              {t('steam-inventory-total', {
                defaultValue: 'Cards held: {{n}}',
                n: data.totalCards,
              })}
            </p>
            {data.groups.map((g) => (
              <section key={g.gameId} className="stm-web-card" aria-labelledby={`stm-inv-${g.gameId}`}>
                <h2 id={`stm-inv-${g.gameId}`} className="stm-web-head">
                  <Link to="/games/$gameId" params={{ gameId: g.gameId }} className="stm-link">
                    {g.title}
                  </Link>
                  <span className="stm-count">
                    {g.badgeLevel > 0
                      ? t('steam-badge-level', {
                          defaultValue: 'Badge level {{level}} of {{max}}',
                          level: g.badgeLevel,
                          max: MAX_BADGE_LEVEL,
                        })
                      : t('steam-no-badge', { defaultValue: 'No badge yet' })}
                  </span>
                </h2>
                <ul className="stm-cardset">
                  {g.cards.map((c) => (
                    <li key={`${c.cardIndex}-${c.foil}`}>
                      <CardArt
                        gameId={g.gameId}
                        title={g.title}
                        hue={g.hue}
                        cardIndex={c.cardIndex}
                        foil={c.foil}
                        width={112}
                      />
                      {c.count > 1 ? <span className="stm-cardcount">×{c.count}</span> : null}
                      <div className="stm-sell-wrap">
                        <SellCard gameId={g.gameId} cardIndex={c.cardIndex} foil={c.foil} />
                        <UnpackCard gameId={g.gameId} cardIndex={c.cardIndex} foil={c.foil} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
