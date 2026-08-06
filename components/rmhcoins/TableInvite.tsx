'use client';

/**
 * The share affordance for a private casino table: the join code, and the link
 * that carries it.
 *
 * A table has no route of its own — it is a game inside a tab inside the
 * Predictions page — so unlike every other lobby on the site its link has to
 * name the tab and the game as well as the code:
 * `/predictions?tab=games&game=blackjack&lobby=AB12CD`. `PlayTab` and
 * `RMHCoinsPage` read the first two; the table itself reads the third.
 */

import { Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { lobbyLink } from '@/lib/lobby-link';

export type CasinoGame = 'blackjack' | 'holdem' | 'baccarat' | 'roulette';

/** Where a link has to land for `game`'s table to be the thing on screen. */
export function casinoTablePath(game: CasinoGame): string {
  return `/predictions?tab=games&game=${game}`;
}

export function TableInvite({ game, joinCode }: { game: CasinoGame; joinCode: string }) {
  const { t } = useTranslation('c-rmhcoins');

  return (
    <span className="flex items-center gap-1 text-[10px] text-site-text-dim sm:text-xs">
      <span className="hidden sm:inline">{t('code-label', { defaultValue: 'Code:' })}</span>
      <span className="font-mono font-bold text-site-accent">{joinCode}</span>
      <CopyButton
        value={lobbyLink(joinCode, casinoTablePath(game))}
        icon={Link2}
        label={t('copy-invite-link', { defaultValue: 'Copy invite link' })}
      />
    </span>
  );
}
