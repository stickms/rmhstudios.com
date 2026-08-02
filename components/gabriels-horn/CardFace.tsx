'use client';

/**
 * Gabriel's Horn — a card, and the strip of them you are holding.
 *
 * What a card has to communicate, in this order: its **colour** (which is the
 * effect), whether it is a **seven** (the only rank with a rule attached), and
 * then, distantly, its rank. So the colour is the whole face, the seven gets a
 * border of its own, and the rank is small and dim — a player scanning their
 * hand for something to play should never have to read a number.
 */

import { useTranslation } from 'react-i18next';
import { Eye, Flame, Repeat2, ScanEye, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SWAP_RANK,
  effectOf,
  type Card,
  type CardColor,
  type CardEffect,
} from '@/lib/gabriels-horn/constants';

const COLOR_VAR: Record<CardColor, string> = {
  azure: 'var(--gh-azure)',
  crimson: 'var(--gh-crimson)',
  verdant: 'var(--gh-verdant)',
  amber: 'var(--gh-amber)',
};

const EFFECT_ICON = {
  glimpse: Eye,
  accuse: Flame,
  ward: Shield,
  scry: ScanEye,
  swap: Repeat2,
} as const satisfies Record<CardEffect, unknown>;

/** Short label for an effect, e.g. on a card face. */
export function useEffectLabel(): (effect: CardEffect) => string {
  const { t } = useTranslation('c-gabriels-horn');
  return (effect: CardEffect) => {
    switch (effect) {
      case 'glimpse':
        return t('effect-glimpse', { defaultValue: 'Glimpse' });
      case 'accuse':
        return t('effect-accuse', { defaultValue: 'Accuse' });
      case 'ward':
        return t('effect-ward', { defaultValue: 'Ward' });
      case 'scry':
        return t('effect-scry', { defaultValue: 'Scry' });
      case 'swap':
        return t('effect-swap', { defaultValue: 'Swap' });
    }
  };
}

/** One line explaining what playing this card does. */
export function useEffectDescription(): (effect: CardEffect) => string {
  const { t } = useTranslation('c-gabriels-horn');
  return (effect: CardEffect) => {
    switch (effect) {
      case 'glimpse':
        return t('effect-glimpse-desc', { defaultValue: 'See your own dice this turn.' });
      case 'accuse':
        return t('effect-accuse-desc', { defaultValue: 'A player of your choice draws.' });
      case 'ward':
        return t('effect-ward-desc', {
          defaultValue: 'Nothing can make you draw until your next turn.',
        });
      case 'scry':
        return t('effect-scry-desc', { defaultValue: "Look at a player's hand." });
      case 'swap':
        return t('effect-swap-desc', { defaultValue: 'Trade your whole hand with a player.' });
    }
  };
}

export function CardFace({
  card,
  selected = false,
  disabled = false,
  onClick,
  className,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const { t } = useTranslation('c-gabriels-horn');
  const label = useEffectLabel();
  const effect = effectOf(card);
  const Icon = EFFECT_ICON[effect];
  const isSwap = card.rank === SWAP_RANK;

  // Three things, in the order a player needs them: the effect's glyph big in
  // the middle of the colour field, the name under it, and the rank tucked into
  // the corner a playing card puts it in — small, because it means nothing
  // unless it is a seven, and a seven says so with its edge instead.
  const body = (
    <>
      <span className="flex items-start justify-between">
        <span className="font-mono text-[0.625rem] leading-none text-(--app-text-dim)">
          {card.rank}
        </span>
        {isSwap ? (
          <span
            className="text-[0.5625rem] leading-none font-bold tracking-[0.08em] uppercase"
            style={{ color: 'var(--gh-swap)' }}
          >
            {t('card-seven-flag', { defaultValue: 'VII' })}
          </span>
        ) : null}
      </span>

      <Icon
        className="mx-auto size-6 shrink-0"
        aria-hidden="true"
        style={{ color: COLOR_VAR[card.color] }}
      />

      <span className="text-center text-[0.6875rem] leading-tight font-semibold">
        {label(effect)}
      </span>
    </>
  );

  const styleVars = { '--gh-card': COLOR_VAR[card.color] } as React.CSSProperties;
  const name = t('card-aria', {
    defaultValue: '{{effect}}, {{color}} {{rank}}',
    effect: label(effect),
    color: card.color,
    rank: card.rank,
  });

  if (!onClick) {
    return (
      <span
        className={cn('gh-card', className)}
        data-swap={isSwap}
        data-selected={selected}
        style={styleVars}
        aria-label={name}
        role="img"
      >
        {body}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={name}
      className={cn('gh-card disabled:cursor-not-allowed disabled:opacity-50', className)}
      data-swap={isSwap}
      data-selected={selected}
      style={styleVars}
    >
      {body}
    </button>
  );
}

/** A read-only fan of cards — a scried hand, or the last look at your own. */
export function CardRow({ cards, className }: { cards: readonly Card[]; className?: string }) {
  return (
    <div className={cn('app-scroll-x flex gap-2 pt-1.5 pb-1', className)}>
      {cards.map((card) => (
        <CardFace key={card.id} card={card} className="w-16 shrink-0" />
      ))}
    </div>
  );
}
