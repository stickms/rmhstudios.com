'use client';

/**
 * Gabriel's Horn — the table.
 *
 * Everything on this screen is rendered from the {@link GameView} the server
 * sent to THIS seat and nothing else. There is no local model of the game to
 * disagree with it, and in particular no local decision about what the player
 * may see: the dice arrive as `null` when they are hidden, and a hand that is
 * not yours arrives as a number. See `lib/gabriels-horn/net/events.ts`.
 *
 * The screen is a document — a column you read top to bottom — so it uses
 * `.app-page` and scrolls the DOCUMENT rather than an inner box, which is what
 * lets mobile Safari collapse its toolbars (components/CLAUDE.md
 * §Full-screen games/apps, rule 5).
 *
 * Layout order is deliberate and matches the order you need things in: what is
 * happening → the dice → who is at the table → the decision in front of you →
 * your hand → the record.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Hand, LogOut, Megaphone, ScanEye, Shield, WifiOff } from 'lucide-react';
import { PHASE_MS, effectOf, needsTarget } from '@/lib/gabriels-horn/constants';
import { clampHouseRules } from '@/lib/gabriels-horn/house-rules';
import type { GameView, TablePlayer } from '@/lib/gabriels-horn/net/events';
import { hornNet } from '@/lib/gabriels-horn/net/client';
import { useHornStore } from '@/lib/gabriels-horn/store';
import { CardFace, CardRow, useEffectDescription, useEffectLabel } from './CardFace';
import { HouseRulesSummary } from './HouseRulesPanel';
import { Dice } from './Dice';
import { TableChat } from './TableChat';
import { TableLog } from './TableLog';
import { HornButton, Panel, SeatAvatar } from './ui';

/**
 * Seconds left in the phase, ticked once a second — not per frame.
 *
 * Clamped at both ends. Zero because a tab that was asleep wakes with a deadline
 * in the past, and the ceiling because `phaseEndsAt` is the SERVER's clock: a
 * device whose own clock is minutes off would otherwise display a countdown of
 * several hundred seconds on a forty-second phase and look broken. The server
 * is the authority on when the phase actually ends either way — this readout is
 * only ever a readout.
 */
const LONGEST_PHASE_SECONDS = Math.ceil(Math.max(...Object.values(PHASE_MS)) / 1000);

function usePhaseSeconds(endsAt: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setSeconds(null);
      return;
    }
    const tick = () =>
      setSeconds(
        Math.min(LONGEST_PHASE_SECONDS, Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return seconds;
}

function Roster({ view }: { view: GameView }) {
  const { t } = useTranslation('c-gabriels-horn');
  return (
    <ul className="app-scroll-x flex gap-2 pb-1">
      {view.players.map((player) => {
        const isActive = player.socketId === view.activeSocketId;
        const isSelf = player.socketId === view.selfSocketId;
        return (
          <li
            key={player.socketId}
            className={`gh-fill flex w-20 shrink-0 flex-col items-center gap-1 p-2 text-center ${
              isActive ? 'border-(--app-accent)' : ''
            }`}
          >
            {/* A disconnected seat is dimmed and labelled rather than hidden.
                Their turns get skipped, so without this the table looks like it
                is jumping people for no reason. */}
            <SeatAvatar
              name={player.name}
              avatarUrl={player.avatarUrl}
              size={30}
              className={player.connected ? undefined : 'opacity-40'}
            />
            <span className="w-full truncate text-xs text-(--app-text-muted)">
              {isSelf ? t('you-suffix', { defaultValue: '(you)' }) : player.name}
            </span>
            <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums">
              {player.handCount}
              {player.warded ? (
                <Shield
                  className="size-3 text-(--gh-verdant)"
                  aria-label={t('warded', { defaultValue: 'Warded' })}
                />
              ) : null}
            </span>
            {!player.connected ? (
              <span className="flex items-center gap-1 text-xs text-(--app-warning)">
                <WifiOff className="size-3" aria-hidden="true" />
                {t('away', { defaultValue: 'away' })}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Pick somebody. Used by Accuse, Scry and the seven's Swap. */
function TargetPicker({
  players,
  selfSocketId,
  onPick,
  label,
}: {
  players: TablePlayer[];
  selfSocketId: string;
  onPick: (socketId: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-(--app-text-muted)">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {players
          .filter((player) => player.socketId !== selfSocketId)
          .map((player) => (
            <HornButton key={player.socketId} size="sm" onClick={() => onPick(player.socketId)}>
              {player.name}
              <span className="font-mono text-(--app-text-dim)">{player.handCount}</span>
            </HornButton>
          ))}
      </div>
    </div>
  );
}

export function TableScreen({
  view,
  onLeave,
  onRules,
}: {
  view: GameView;
  onLeave: () => void;
  onRules: () => void;
}) {
  const { t } = useTranslation('c-gabriels-horn');
  const effectLabel = useEffectLabel();
  const effectDescription = useEffectDescription();
  const selectedCardId = useHornStore((s) => s.selectedCardId);
  const selectCard = useHornStore((s) => s.selectCard);
  const seconds = usePhaseSeconds(view.phaseEndsAt);
  // Tolerates a hub older than this bundle (see HouseRulesPanel).
  const rules = clampHouseRules(view.rules);

  const isMyTurn = view.activeSocketId === view.selfSocketId;
  const active = view.players.find((p) => p.socketId === view.activeSocketId);
  const activeName = active?.name ?? '';
  const myClaim = view.claims.find((claim) => claim.socketId === view.selfSocketId);
  const selectedCard = useMemo(
    () => view.hand.find((card) => card.id === selectedCardId) ?? null,
    [view.hand, selectedCardId],
  );

  // Cards are spent on your own turn, before you commit to the roll — buying a
  // look at the dice AFTER hearing the claims would make Azure an auto-win.
  const canPlayCards = isMyTurn && (view.phase === 'action' || view.phase === 'final');

  const play = (cardId: string, targetSocketId?: string) => {
    hornNet.play(cardId, targetSocketId);
    selectCard(null);
  };

  const headline = (() => {
    switch (view.phase) {
      case 'action':
        return isMyTurn
          ? t('phase-action-you', { defaultValue: 'Your turn. Play cards, then roll.' })
          : t('phase-action-them', { defaultValue: '{{name}} is deciding.', name: activeName });
      case 'claim':
        return isMyTurn
          ? t('phase-claim-you', { defaultValue: 'Listening. What did you roll?' })
          : t('phase-claim-them', {
              defaultValue: '{{name}} cannot see the dice. Tell them a total.',
              name: activeName,
            });
      case 'call':
        return isMyTurn
          ? t('phase-call-you', { defaultValue: 'Pick somebody. Truth, or lie?' })
          : t('phase-call-them', {
              defaultValue: '{{name}} is choosing who to call.',
              name: activeName,
            });
      case 'reveal':
        return t('phase-reveal', { defaultValue: 'Dice up.' });
      case 'final':
        return isMyTurn
          ? t('phase-final-you', { defaultValue: 'Your last turn. Cards only.' })
          : t('phase-final-them', {
              defaultValue: '{{name}} is taking their last turn.',
              name: activeName,
            });
      default:
        return t('phase-over', { defaultValue: 'Counting hands.' });
    }
  })();

  return (
    <div className="gh-scene app-page app-safe-x text-(--app-text)">
      {/* Three groups in a row on a 320px screen: the code truncates first
          because it is the only one you can also read off the lobby, the round
          and clock never shrink because they are what the turn is measured in,
          and the controls never shrink because they are the way out. */}
      <header className="app-safe-top flex items-center justify-between gap-2 px-4 pt-3">
        <span className="min-w-0 truncate font-mono text-xs tracking-[0.15em] text-(--app-text-dim)">
          {view.code}
        </span>
        <span className="shrink-0 text-xs text-(--app-text-muted)">
          {t('round', { defaultValue: 'Round {{n}}', n: view.round })}
          {seconds !== null ? (
            <span className="ms-2 font-mono tabular-nums" aria-live="off">
              {seconds}s
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <HornButton
            variant="ghost"
            size="sm"
            onClick={onRules}
            aria-label={t('read-rules', { defaultValue: 'Read the rules' })}
          >
            <BookOpen className="size-3.5" aria-hidden="true" />
          </HornButton>
          <HornButton
            variant="ghost"
            size="sm"
            onClick={onLeave}
            aria-label={t('leave-table', { defaultValue: 'Leave' })}
          >
            <LogOut className="size-3.5" aria-hidden="true" />
          </HornButton>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-lg grow flex-col gap-3 px-4 py-4">
        <p className="text-center text-sm font-semibold" role="status" aria-live="polite">
          {headline}
        </p>

        {view.endCalledBy ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-(--app-accent)">
            <Megaphone className="size-3.5" aria-hidden="true" />
            {t('horn-sounded', { defaultValue: 'The horn has sounded. Last turns.' })}
          </p>
        ) : null}

        {view.phase !== 'final' ? (
          <Dice faces={view.dice.faces} total={view.dice.total} glimpsed={view.dice.glimpsed} />
        ) : null}

        <Roster view={view} />

        <HouseRulesSummary rules={view.rules} />

        {/* ── The decision in front of you ─────────────────────────────── */}

        {view.phase === 'action' && isMyTurn ? (
          <Panel className="grid gap-2">
            <HornButton variant="primary" onClick={() => hornNet.roll()}>
              {t('roll', { defaultValue: 'Roll the dice' })}
            </HornButton>
            <HornButton variant="secondary" onClick={() => hornNet.soundEnd()}>
              <Megaphone className="size-4" aria-hidden="true" />
              {t('sound-horn', { defaultValue: 'Sound the horn' })}
            </HornButton>
            <p className="text-center text-xs text-(--app-text-dim)">
              {t('sound-horn-hint', {
                defaultValue: 'You must be strictly lowest when the counting stops.',
              })}
            </p>
          </Panel>
        ) : null}

        {view.phase === 'claim' && !isMyTurn && !myClaim?.total ? (
          <Panel className="space-y-2">
            <p className="text-xs text-(--app-text-muted)">
              {t('claim-prompt', {
                defaultValue: 'Say a total. It does not have to be the right one.',
              })}
            </p>
            {/* Sixteen numbers. Eight columns on a phone gives ~30px targets,
                which is a miss waiting to happen when the number you tap is the
                lie you are committing to — so it starts at four and widens with
                the viewport. */}
            <div className="grid grid-cols-4 gap-1.5 min-[420px]:grid-cols-6 sm:grid-cols-8">
              {Array.from(
                { length: rules.diceCount * 6 - rules.diceCount + 1 },
                (_, i) => rules.diceCount + i,
              ).map((total) => (
                <HornButton
                  key={total}
                  variant={total === view.dice.total ? 'primary' : 'secondary'}
                  onClick={() => hornNet.claim(total)}
                  className="px-0 tabular-nums"
                >
                  {total}
                </HornButton>
              ))}
            </div>
            <p className="text-xs text-(--app-text-dim)">
              {t('claim-truth-hint', { defaultValue: 'The true total is highlighted.' })}
            </p>
          </Panel>
        ) : null}

        {view.claims.length > 0 && view.phase !== 'action' && view.phase !== 'final' ? (
          <Panel className="space-y-1.5">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-(--app-text-muted) uppercase">
              {t('the-table-says', { defaultValue: 'The table says' })}
            </h2>
            <ul className="space-y-1.5">
              {view.claims.map((claim) => {
                const who = view.players.find((p) => p.socketId === claim.socketId);
                const called = view.outcome?.targetSocketId === claim.socketId;
                return (
                  // Wraps rather than truncates: a long display name plus a
                  // total plus two verdict buttons does not fit one 320px line,
                  // and squeezing them would shrink the two controls the whole
                  // round comes down to.
                  <li
                    key={claim.socketId}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
                  >
                    <span className="min-w-0 grow truncate text-sm">{who?.name ?? '—'}</span>
                    <span className="font-mono text-base font-bold tabular-nums">
                      {claim.total ?? '—'}
                    </span>
                    {claim.lie === null ? null : (
                      <span
                        className={`text-xs font-semibold ${
                          claim.lie ? 'text-(--app-danger)' : 'text-(--app-success)'
                        }`}
                      >
                        {claim.lie
                          ? t('was-lie', { defaultValue: 'lie' })
                          : t('was-truth', { defaultValue: 'true' })}
                      </span>
                    )}
                    {called ? (
                      <span className="text-xs text-(--app-accent)">
                        {t('called', { defaultValue: 'called' })}
                      </span>
                    ) : null}
                    {view.phase === 'call' && isMyTurn && claim.total !== null ? (
                      <span className="flex shrink-0 gap-1.5">
                        <HornButton onClick={() => hornNet.call(claim.socketId, 'truth')}>
                          {t('call-truth', { defaultValue: 'True' })}
                        </HornButton>
                        <HornButton
                          variant="danger"
                          onClick={() => hornNet.call(claim.socketId, 'lie')}
                        >
                          {t('call-lie', { defaultValue: 'Lie' })}
                        </HornButton>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        ) : null}

        {view.phase === 'reveal' && view.outcome ? (
          <p
            className={`text-center text-sm font-semibold ${
              view.outcome.correct ? 'text-(--app-success)' : 'text-(--app-danger)'
            }`}
            role="status"
          >
            {view.outcome.drewSocketId === null
              ? t('outcome-warded', {
                  defaultValue: 'Warded — nobody draws.',
                })
              : t('outcome', {
                  defaultValue: '{{name}} draws {{count}}.',
                  name:
                    view.players.find((p) => p.socketId === view.outcome?.drewSocketId)?.name ?? '',
                  count: view.outcome.drawn,
                })}
          </p>
        ) : null}

        {view.phase === 'final' && isMyTurn ? (
          <HornButton variant="primary" onClick={() => hornNet.pass()}>
            {t('pass', { defaultValue: 'Pass' })}
          </HornButton>
        ) : null}

        {/* ── Your hand ────────────────────────────────────────────────── */}

        <Panel className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-(--app-text-muted) uppercase">
            <Hand className="size-3.5" aria-hidden="true" />
            {t('your-hand', { defaultValue: 'Your hand — {{n}}', n: view.hand.length })}
          </h2>

          {view.hand.length === 0 ? (
            <p className="text-sm text-(--app-success)">
              {t('hand-empty', { defaultValue: 'Nothing at all. Sound the horn.' })}
            </p>
          ) : (
            <div className="gh-hand">
              {view.hand.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  className="w-[4.25rem]"
                  selected={card.id === selectedCardId}
                  disabled={!canPlayCards}
                  onClick={() => selectCard(card.id === selectedCardId ? null : card.id)}
                />
              ))}
            </div>
          )}

          {!canPlayCards ? (
            <p className="text-xs text-(--app-text-dim)">
              {t('hand-locked', {
                defaultValue: 'Cards are played on your own turn, before you roll.',
              })}
            </p>
          ) : selectedCard ? (
            <div className="space-y-2 border-t border-(--app-border) pt-2">
              <p className="text-sm">
                <strong className="text-(--app-text)">{effectLabel(effectOf(selectedCard))}</strong>{' '}
                <span className="text-(--app-text-muted)">
                  {effectDescription(effectOf(selectedCard))}
                </span>
              </p>
              <p className="text-xs text-(--app-text-dim)">
                {t('play-cost', {
                  defaultValue: 'Costs you {{draw}} cards for the one you spend — net one worse.',
                  draw: rules.playDraw,
                })}
              </p>
              {needsTarget(selectedCard) ? (
                <TargetPicker
                  players={view.players}
                  selfSocketId={view.selfSocketId}
                  label={t('pick-target', { defaultValue: 'On whom?' })}
                  onPick={(socketId) => play(selectedCard.id, socketId)}
                />
              ) : (
                <HornButton variant="primary" onClick={() => play(selectedCard.id)}>
                  {t('play-card', { defaultValue: 'Play it' })}
                </HornButton>
              )}
            </div>
          ) : (
            <p className="text-xs text-(--app-text-dim)">
              {t('hand-hint', {
                defaultValue: 'Tap a card to see what it does. A caught lie costs {{penalty}}.',
                penalty: rules.penaltyDraw,
              })}
            </p>
          )}
        </Panel>

        {view.scry ? (
          <Panel className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-(--gh-amber) uppercase">
              <ScanEye className="size-3.5" aria-hidden="true" />
              {t('scried-hand', { defaultValue: '{{name}}’s hand', name: view.scry.name })}
            </h2>
            <CardRow cards={view.scry.cards} />
          </Panel>
        ) : null}

        <Panel className="space-y-3">
          <TableChat />
          <div className="border-t border-(--app-border) pt-2">
            <TableLog log={view.log} />
          </div>
        </Panel>

        <p className="text-center text-xs text-(--app-text-dim)">
          {t('deck-left', {
            defaultValue: '{{count}} cards left in the deck',
            count: view.deckCount,
          })}
        </p>
      </main>
    </div>
  );
}
