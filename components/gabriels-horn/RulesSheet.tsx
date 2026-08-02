'use client';

/**
 * Gabriel's Horn — the rules, in the game.
 *
 * This is a new game with an inverted premise (you are the one person who
 * cannot see your own roll), so it cannot be learned by pattern-matching
 * against a game the player already knows. The sheet is reachable from every
 * screen for that reason, and it states the card economy in numbers rather than
 * prose — "a draw is three cards, a play costs you one" is the whole strategy,
 * and a player who has not been told it plays the first game blind.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import {
  COLORS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PENALTY_DRAW,
  PHASE_MS,
  PLAY_DRAW,
  RANKS,
  RECONNECT_GRACE_MS,
  STARTING_HAND,
  SWAP_RANK,
} from '@/lib/gabriels-horn/constants';

const DECK_SIZE = COLORS.length * RANKS.length;
import { HornButton } from './ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold tracking-[0.14em] text-(--app-accent) uppercase">
        {title}
      </h3>
      <div className="space-y-1.5 text-sm text-(--app-text-muted)">{children}</div>
    </section>
  );
}

export function RulesSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('c-gabriels-horn');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The only fixed-position surface in the game, and it is a full-screen
  // scroller rather than a centred box: the rules are long, and on a phone held
  // sideways a vertically-centred panel taller than the window puts its first
  // paragraph above a scroll origin that cannot go negative. Column flex plus
  // the `-safe` centring keeps every line reachable.
  return (
    <div className="app-scroll-y fixed inset-0 z-50 flex flex-col items-center-safe justify-center-safe bg-(--app-scrim) p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gh-rules-title"
        className="gh-overlay w-full max-w-xl p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="gh-rules-title" className="text-lg font-bold text-(--app-text)">
            {t('rules-title', { defaultValue: 'How Gabriel’s Horn works' })}
          </h2>
          <HornButton
            ref={closeRef}
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t('rules-close', { defaultValue: 'Close the rules' })}
          >
            <X className="size-4" aria-hidden="true" />
          </HornButton>
        </div>

        <div className="space-y-4">
          <Section title={t('rules-turn-title', { defaultValue: 'Your turn' })}>
            <p>
              {t('rules-turn-1', {
                defaultValue:
                  'Three dice are rolled and you are the only person at the table who cannot see them. Everyone else can.',
              })}
            </p>
            <p>
              {t('rules-turn-2', {
                defaultValue:
                  'Each of them tells you a total. They may tell the truth or they may not. You pick one of them and call it — truth, or lie.',
              })}
            </p>
            <p>
              {t('rules-turn-3', {
                defaultValue: 'Right, and they draw {{penalty}}. Wrong, and you draw {{penalty}}.',
                penalty: PENALTY_DRAW,
              })}
            </p>
          </Section>

          <Section title={t('rules-cards-title', { defaultValue: 'Cards are the punishment' })}>
            <p>
              {t('rules-cards-1', {
                defaultValue:
                  'Everyone starts with {{start}}. Drawing is never one card: the card you drew brings two more, so being caught costs {{penalty}}.',
                start: STARTING_HAND,
                penalty: PENALTY_DRAW,
              })}
            </p>
            <p>
              {t('rules-cards-2', {
                defaultValue:
                  'Playing a card is a discard, and a discard draws {{draw}} — so every card you use leaves you one card worse off. Use one anyway when it costs somebody else three.',
                draw: PLAY_DRAW,
              })}
            </p>
            <p>
              {t('rules-cards-3', {
                defaultValue:
                  'Your own cards are always yours to look at. Cards are played on your own turn, before you roll.',
              })}
            </p>
          </Section>

          <Section title={t('rules-colors-title', { defaultValue: 'Colour is the card' })}>
            <p>
              {t('rules-colors-intro', {
                defaultValue: 'Rank means nothing. Colour means everything.',
              })}
            </p>
            <ul className="space-y-1.5">
              <li>
                <span
                  className="gh-pip me-2 align-middle"
                  style={{ '--gh-card': 'var(--gh-azure)' } as React.CSSProperties}
                />
                <strong className="text-(--app-text)">
                  {t('effect-glimpse', { defaultValue: 'Glimpse' })}
                </strong>{' '}
                — {t('effect-glimpse-desc', { defaultValue: 'See your own dice this turn.' })}
              </li>
              <li>
                <span
                  className="gh-pip me-2 align-middle"
                  style={{ '--gh-card': 'var(--gh-crimson)' } as React.CSSProperties}
                />
                <strong className="text-(--app-text)">
                  {t('effect-accuse', { defaultValue: 'Accuse' })}
                </strong>{' '}
                — {t('effect-accuse-desc', { defaultValue: 'A player of your choice draws.' })}
              </li>
              <li>
                <span
                  className="gh-pip me-2 align-middle"
                  style={{ '--gh-card': 'var(--gh-verdant)' } as React.CSSProperties}
                />
                <strong className="text-(--app-text)">
                  {t('effect-ward', { defaultValue: 'Ward' })}
                </strong>{' '}
                —{' '}
                {t('effect-ward-desc', {
                  defaultValue: 'Nothing can make you draw until your next turn.',
                })}
              </li>
              <li>
                <span
                  className="gh-pip me-2 align-middle"
                  style={{ '--gh-card': 'var(--gh-amber)' } as React.CSSProperties}
                />
                <strong className="text-(--app-text)">
                  {t('effect-scry', { defaultValue: 'Scry' })}
                </strong>{' '}
                — {t('effect-scry-desc', { defaultValue: "Look at a player's hand." })}
              </li>
              <li>
                <span
                  className="gh-pip me-2 align-middle"
                  style={{ '--gh-card': 'var(--gh-swap)' } as React.CSSProperties}
                />
                <strong className="text-(--app-text)">
                  {t('rules-seven', { defaultValue: 'Any seven' })}
                </strong>{' '}
                —{' '}
                {t('rules-seven-desc', {
                  defaultValue:
                    'the one rank that matters: trade your entire hand with anyone you like. It ignores the colour.',
                  rank: SWAP_RANK,
                })}
              </li>
            </ul>
          </Section>

          <Section title={t('rules-end-title', { defaultValue: 'Sounding the horn' })}>
            <p>
              {t('rules-end-1', {
                defaultValue:
                  'On your turn, instead of rolling, you may call the End. Everyone else then takes one last turn — cards only, no dice — and hands are counted.',
              })}
            </p>
            <p>
              {t('rules-end-2', {
                defaultValue:
                  'Fewest cards wins. But whoever sounded the horn has to be strictly lowest: tie the field or lose to it and the call backfires, and they finish last however few cards they are holding.',
              })}
            </p>
            <p>
              {t('rules-end-3', {
                defaultValue:
                  'Which is why that last turn is dangerous. The player sitting on a seven can still take your three-card hand off you.',
              })}
            </p>
          </Section>

          <Section title={t('rules-table-title', { defaultValue: 'The table' })}>
            <p>
              {t('rules-table-1', {
                defaultValue:
                  '{{min}} to {{max}} players. Everyone can see how many cards everyone else is holding — that is the score, and hiding it would hide the race. What is in those hands is private.',
                min: MIN_PLAYERS,
                max: MAX_PLAYERS,
              })}
            </p>
            <p>
              {t('rules-table-3', {
                defaultValue:
                  'Talk to each other. The numbers are the only structured part of a claim — the persuading, the pattern-spotting and the outright lying happen in the chat, and a bluffing game without it is a coin flip.',
              })}
            </p>
            <p>
              {t('rules-table-4', {
                defaultValue:
                  'One deck of {{deck}} — four colours, thirteen ranks. When it runs out the discards are shuffled back in, so it never actually runs dry.',
                deck: DECK_SIZE,
              })}
            </p>
          </Section>

          <Section title={t('rules-clock-title', { defaultValue: 'The clock' })}>
            <p>
              {t('rules-clock-1', {
                defaultValue:
                  'Every phase is timed, and every timeout has a defined outcome rather than a stall: {{action}}s to play cards and roll, {{claim}}s to say a number, {{call}}s to make the call.',
                action: Math.round(PHASE_MS.action / 1000),
                claim: Math.round(PHASE_MS.claim / 1000),
                call: Math.round(PHASE_MS.call / 1000),
              })}
            </p>
            <p>
              {t('rules-clock-2', {
                defaultValue:
                  'Say nothing and you are recorded as having told the TRUTH — silence is never scored as a lie. Let the call run out and the roller draws, because they had the whole phase to make one.',
              })}
            </p>
          </Section>

          <Section title={t('rules-away-title', { defaultValue: 'If you drop out' })}>
            <p>
              {t('rules-away-1', {
                defaultValue:
                  'Losing signal does not lose you the game. Your seat, your cards and your place in the order are held for about {{seconds}} seconds, and coming back — reconnecting, or reloading the page — puts you straight back in them.',
                seconds: Math.round(RECONNECT_GRACE_MS / 1000),
              })}
            </p>
            <p>
              {t('rules-away-2', {
                defaultValue:
                  'The table does not wait, though. While you are away your turns are skipped and your answers default to the truth, so nobody is stuck watching a clock run down on somebody who is not there.',
              })}
            </p>
          </Section>
        </div>

        <div className="mt-5 flex justify-end">
          <HornButton variant="primary" onClick={onClose}>
            {t('rules-got-it', { defaultValue: 'Got it' })}
          </HornButton>
        </div>
      </div>
    </div>
  );
}
