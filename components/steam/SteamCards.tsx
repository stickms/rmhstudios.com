'use client';

import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { SET_SIZE, BADGE_XP, MAX_BADGE_LEVEL } from '@/lib/cards/cards';
import type { TitleCards } from '@/lib/cards/types';
import { CardArt } from './CardArt';

/** A title's trading-card set: what you hold, what is missing, and crafting the badge. */
export function SteamCards({
  gameId,
  title,
  hue,
  cards,
}: {
  gameId: string;
  title: string;
  hue: number;
  cards: TitleCards;
}) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const have = cards.owned.filter((n) => n > 0).length;

  async function craft(foil: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/games/cards/craft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId, foil }),
      });
      if (!res.ok) {
        toast.error(t('steam-craft-failed', { defaultValue: 'Could not craft the badge.' }));
        return;
      }
      toast.success(t('steam-craft-done', { defaultValue: 'Badge crafted.' }));
      await router.invalidate();
    } catch {
      toast.error(t('steam-craft-failed', { defaultValue: 'Could not craft the badge.' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="cards" className="stm-card" aria-labelledby="stm-cards-h">
      <h2 id="stm-cards-h" className="stm-card-head">
        {t('steam-trading-cards', { defaultValue: 'Trading Cards' })}
        <span className="stm-count">
          {t('steam-cards-have', { defaultValue: '{{have}} of {{total}}', have, total: SET_SIZE })}
        </span>
      </h2>
      <ul className="stm-cardset">
        {Array.from({ length: SET_SIZE }, (_, i) => (
          <li key={i}>
            <CardArt
              gameId={gameId}
              title={title}
              hue={hue}
              cardIndex={i}
              owned={cards.owned[i] > 0 || cards.foilOwned[i] > 0}
              foil={cards.owned[i] === 0 && cards.foilOwned[i] > 0}
              width={104}
            />
            {cards.owned[i] + cards.foilOwned[i] > 1 ? (
              <span className="stm-cardcount">×{cards.owned[i] + cards.foilOwned[i]}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="stm-card-note stm-muted">
        {cards.dropsRemaining > 0
          ? t('steam-drops-left', {
              defaultValue: 'Card drops remaining: {{n}}. Keep playing to earn them.',
              n: cards.dropsRemaining,
            })
          : t('steam-drops-done', { defaultValue: 'You have earned every card drop for this title.' })}
      </p>
      <div className="stm-card-foot">
        <span>
          {t('steam-badge-level', {
            defaultValue: 'Badge level {{level}} of {{max}}',
            level: cards.badgeLevel,
            max: MAX_BADGE_LEVEL,
          })}
        </span>
        <button
          type="button"
          className="stm-btn stm-btn-blue"
          disabled={!cards.canCraft || busy}
          onClick={() => void craft(false)}
        >
          {t('steam-craft-badge', { defaultValue: 'Craft badge (+{{xp}} XP)', xp: BADGE_XP })}
        </button>
        {cards.canCraftFoil ? (
          <button
            type="button"
            className="stm-btn stm-btn-blue"
            disabled={busy}
            onClick={() => void craft(true)}
          >
            {t('steam-craft-foil', { defaultValue: 'Craft foil badge' })}
          </button>
        ) : null}
        <Link to="/games/inventory" className="stm-link">
          {t('steam-view-inventory', { defaultValue: 'Inventory' })}
        </Link>
      </div>
    </section>
  );
}
