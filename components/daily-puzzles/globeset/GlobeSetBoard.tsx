'use client';

/**
 * The seven face-up cards, plus the parity ledger under them.
 *
 * The ledger is the board's only teaching device: it shows, per colour,
 * whether the current selection has an **odd** number of that dot. A GlobeSet is
 * exactly a selection with no odd colours left, so the ledger turns an abstract
 * rule ("every colour an even number of times") into a row of six lights you
 * are trying to switch off. It says nothing about which cards to pick — it only
 * restates the selection the player already made, which is why it can be shown
 * without giving the puzzle away.
 *
 * Selection lives in the parent: claiming a GlobeSet, charging a dead end and
 * refilling the board are all run-level decisions, and a board that owned its
 * own selection would have to hand all three back up anyway.
 */

import { useCallback, useEffect } from 'react';
import { AnimatePresence, m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { colorParity, DOT_COLORS, type Card } from '@/lib/globeset/cards';
import { X } from 'lucide-react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { APPLE_SPRING } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { GlobeSetCard } from './GlobeSetCard';

export interface GlobeSetBoardProps {
  board: readonly Card[];
  /**
   * Everything below names CARDS, never board positions.
   *
   * A position means something different the instant a claim refills the board,
   * and a card claimed mid-animation is still in the DOM for the length of its
   * exit — so a click landing on one would have applied a stale index to a
   * fresh board and selected somebody else's card. A card value is unique in
   * the deck and self-describing: a click on a card that has already left is
   * simply a no-op.
   */
  selected: readonly Card[];
  /** Cards a hint has revealed. */
  hinted: readonly Card[];
  /** Cards the auto-solver is lifting right now. */
  solving: readonly Card[];
  /** No input — the run is over, or the solver has the board. */
  locked: boolean;
  shapes: boolean;
  onToggle: (card: Card) => void;
  onClear: () => void;
}

export function GlobeSetBoard({
  board,
  selected,
  hinted,
  solving,
  locked,
  shapes,
  onToggle,
  onClear,
}: GlobeSetBoardProps) {
  const { t } = useTranslation('c-daily-puzzles');
  const reduced = useReducedMotion();

  // Only cards still face-up count toward the ledger: a selection can outlive a
  // refill for the length of an exit animation.
  const live = selected.filter((card) => board.includes(card));
  const parity = colorParity(live);

  // 1–7 toggle a card, Escape clears. Bound on the window rather than the board
  // so the shortcut works wherever focus is, and skipped while the player is
  // typing (the race lobby has a room-code field).
  const onKey = useCallback(
    (event: KeyboardEvent) => {
      if (locked || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (event.key === 'Escape') {
        onClear();
        return;
      }
      const position = Number(event.key);
      if (Number.isInteger(position) && position >= 1 && position <= board.length) {
        event.preventDefault();
        onToggle(board[position - 1]);
      }
    },
    [board, locked, onClear, onToggle],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const colorName = (id: string, fallback: string) =>
    t(`globeset-color-${id}`, { defaultValue: fallback });

  return (
    <div>
      <ul
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7"
        aria-label={t('globeset-board-label', { defaultValue: 'Cards in play' })}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {board.map((card, index) => (
            <motion.li
              key={card}
              layout={!reduced}
              className="list-none"
              initial={reduced ? false : { opacity: 0, scale: 0.86 }}
              animate={{ opacity: 1, scale: 1 }}
              // `pointerEvents: 'none'` is the load-bearing half: a claimed
              // card lingers in the DOM for the length of its exit, and
              // without this it is still clickable on its way out.
              exit={{ opacity: 0, scale: 0.7, pointerEvents: 'none' }}
              transition={reduced ? { duration: 0 } : APPLE_SPRING.snappy}
            >
              <GlobeSetCard
                card={card}
                position={index + 1}
                selected={selected.includes(card)}
                hinted={hinted.includes(card)}
                solving={solving.includes(card)}
                disabled={locked}
                shapes={shapes}
                onToggle={() => onToggle(card)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {/* ── Parity ledger ───────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {/* Escape clears too, but a keyboard shortcut nobody is shown is not an
            affordance — and backing out of a selection is the second-most
            common thing a player does here after picking a card. */}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onClear}
          disabled={live.length === 0}
        >
          <X className="h-3 w-3" aria-hidden />
          {t('globeset-clear', { defaultValue: 'Clear' })}
        </Button>
        <span className="text-xs font-medium uppercase tracking-wide text-site-text-muted">
          {t('globeset-ledger-label', { defaultValue: 'Odd colours' })}
        </span>
        <ul className="flex items-center gap-2">
          {DOT_COLORS.map((dot, i) => {
            const odd = parity[i];
            return (
              <li key={dot.id}>
                <span
                  className={
                    odd
                      ? 'block h-4 w-4 rounded-full border-2 border-site-text'
                      : 'block h-4 w-4 rounded-full border-2 border-transparent opacity-25'
                  }
                  style={{ background: `var(${dot.token})` }}
                  title={colorName(dot.id, dot.id)}
                />
                <span className="sr-only">
                  {odd
                    ? t('globeset-ledger-odd', {
                        defaultValue: '{{color}}: odd — still unpaired',
                        color: colorName(dot.id, dot.id),
                      })
                    : t('globeset-ledger-even', {
                        defaultValue: '{{color}}: even',
                        color: colorName(dot.id, dot.id),
                      })}
                </span>
              </li>
            );
          })}
        </ul>
        {/* Screen readers get the whole answer in one sentence rather than six
            separate dot labels they would have to hold in their head. */}
        <p aria-live="polite" className="sr-only">
          {parity.some(Boolean)
            ? t('globeset-ledger-status-odd', {
                defaultValue: 'Unpaired colours: {{count}}',
                count: parity.filter(Boolean).length,
              })
            : live.length > 0
              ? t('globeset-ledger-status-complete', { defaultValue: 'Every colour is paired.' })
              : t('globeset-ledger-status-empty', { defaultValue: 'No cards selected.' })}
        </p>
      </div>
    </div>
  );
}
