'use client';

/**
 * The front screen: pick a mode, set the rules, read the board.
 *
 * Solo starts immediately. Versus needs the hub, so those actions connect
 * first and report their own progress — the connection is not a modal gate on
 * the whole screen, because someone who only wants a solo run should never wait
 * for a websocket.
 *
 * Duration and difficulty ride `LiquidTabs`: they are segmented controls, and
 * hand-rolled ones fail `lib/__tests__/design-consistency.test.ts`.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Play, Users, Search, LogIn, Swords, WashingMachine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import {
  DIFFICULTIES,
  MATCH_DURATIONS,
  SCORE,
  type Difficulty,
  type MatchDuration,
} from '@/lib/laundry-sort/constants';
import { useLaundryStore } from '@/lib/laundry-sort/store';
import { LeaderboardPanel } from './LeaderboardPanel';
import { WashLegend } from './WashLegend';

interface Props {
  signedIn: boolean;
  connecting: boolean;
  leaderboardKey: number;
  onSolo: () => void;
  onQuickMatch: () => void;
  onCreateLobby: () => void;
  onJoinCode: (code: string) => void;
  onBrowse: () => void;
}

export function MainMenu({
  signedIn,
  connecting,
  leaderboardKey,
  onSolo,
  onQuickMatch,
  onCreateLobby,
  onJoinCode,
  onBrowse,
}: Props) {
  const { t } = useTranslation('c-laundry-sort');
  const durationSec = useLaundryStore((s) => s.durationSec);
  const difficulty = useLaundryStore((s) => s.difficulty);
  const setDuration = useLaundryStore((s) => s.setDuration);
  const setDifficulty = useLaundryStore((s) => s.setDifficulty);
  const [code, setCode] = useState('');

  const difficultyLabel: Record<Difficulty, string> = {
    relaxed: t('difficulty-relaxed', { defaultValue: 'Relaxed' }),
    standard: t('difficulty-standard', { defaultValue: 'Standard' }),
    frantic: t('difficulty-frantic', { defaultValue: 'Frantic' }),
  };

  return (
    <div className="ls-overlay z-40 bg-black/55 backdrop-blur-[2px]">
      <div className="mx-auto grid min-h-full w-full content-center max-w-5xl gap-3 p-3 sm:p-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="ls-menu-panel ls-panel-strong flex flex-col gap-4 p-4 sm:p-6">
          <header className="ls-menu-header space-y-1.5">
            <h2 className="flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl">
              <WashingMachine className="size-5 text-[var(--ls-accent)]" aria-hidden="true" />
              {t('sort-the-laundry', { defaultValue: 'Sort the laundry' })}
            </h2>
            <p className="ls-short-hide ls-muted text-sm">
              {t('game-description', {
                defaultValue:
                  'Real cloth, real gravity. Grab garments out of the air and drop them in the bin that matches their wash — colour and weave both.',
              })}
            </p>
          </header>

          <div className="ls-menu-setup flex flex-col gap-4">
            <WashLegend />

            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="ls-muted text-[11px] font-semibold uppercase tracking-widest">
                  {t('round-length', { defaultValue: 'Round length' })}
                </p>
                <LiquidTabs
                  tabs={MATCH_DURATIONS.map((d) => ({
                    id: String(d),
                    label: t('seconds-short', { defaultValue: '{{count}}s', count: d }),
                  }))}
                  value={String(durationSec)}
                  onChange={(id) => setDuration(Number(id) as MatchDuration)}
                  aria-label={t('round-length', { defaultValue: 'Round length' })}
                />
              </div>

              <div className="space-y-1.5">
                <p className="ls-muted text-[11px] font-semibold uppercase tracking-widest">
                  {t('difficulty', { defaultValue: 'Difficulty' })}
                </p>
                <LiquidTabs
                  tabs={DIFFICULTIES.map((d) => ({ id: d, label: difficultyLabel[d] }))}
                  value={difficulty}
                  onChange={(id) => setDifficulty(id as Difficulty)}
                  aria-label={t('difficulty', { defaultValue: 'Difficulty' })}
                />
              </div>
            </div>
          </div>

          {signedIn ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={onSolo} className="w-full" size="lg">
                <Play className="size-4" aria-hidden="true" />
                {t('start-solo', { defaultValue: 'Start solo run' })}
              </Button>
              <Button
                onClick={onQuickMatch}
                variant="outline"
                className="w-full"
                size="lg"
                disabled={connecting}
              >
                <Swords className="size-4" aria-hidden="true" />
                {connecting
                  ? t('connecting', { defaultValue: 'Connecting…' })
                  : t('quick-match', { defaultValue: 'Quick match' })}
              </Button>

              <Button onClick={onCreateLobby} variant="ghost" disabled={connecting}>
                <Users className="size-4" aria-hidden="true" />
                {t('create-lobby', { defaultValue: 'Create lobby' })}
              </Button>
              <Button onClick={onBrowse} variant="ghost" disabled={connecting}>
                <Search className="size-4" aria-hidden="true" />
                {t('browse-lobbies', { defaultValue: 'Browse lobbies' })}
              </Button>

              <form
                className="flex gap-2 sm:col-span-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const clean = code.trim().toUpperCase();
                  if (clean.length >= 4) onJoinCode(clean);
                }}
              >
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 8))}
                  placeholder={t('room-code', { defaultValue: 'Room code' })}
                  aria-label={t('room-code', { defaultValue: 'Room code' })}
                  className="ls-numeric uppercase tracking-[0.3em]"
                  // Room codes are A–Z/0–9. Without these, iOS opens a
                  // lowercase keyboard, autocapitalises the first letter only,
                  // and autocorrects a six-letter code into a dictionary word.
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  enterKeyHint="go"
                  maxLength={8}
                />
                <Button type="submit" variant="outline" disabled={connecting || code.length < 4}>
                  {t('join', { defaultValue: 'Join' })}
                </Button>
              </form>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="ls-muted text-sm">
                {t('sign-in-to-play', {
                  defaultValue: 'Sign in to play, save scores and race other people.',
                })}
              </p>
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/login" search={{ callbackURL: '/laundry-sort' }}>
                  <LogIn className="size-4" aria-hidden="true" />
                  {t('sign-in', { defaultValue: 'Sign in' })}
                </Link>
              </Button>
            </div>
          )}

          {/* Scoring reference, deliberately last. On a phone in landscape the
              panel is taller than the screen, and whatever sits above the fold
              is what the player sees first — that has to be the buttons, not
              four lines of rules they can read any time. */}
          <ul className="ls-short-hide ls-muted space-y-1 text-xs">
            <li>
              {t('rule-correct', {
                defaultValue: 'Right bin: +{{points}}, and every streak sort adds 10% up to +100%.',
                points: SCORE.correct,
              })}
            </li>
            <li>
              {t('rule-wrong', {
                defaultValue: 'Wrong bin: {{points}} and the streak breaks.',
                points: SCORE.wrong,
              })}
            </li>
            <li>
              {t('rule-missed', {
                defaultValue: 'Dropped on the floor: no penalty, but the streak still breaks.',
              })}
            </li>
            <li>
              {t('rule-controls', {
                defaultValue:
                  'Drag with mouse, finger or pen. Or steer with the arrow keys and pinch with Space.',
              })}
            </li>
          </ul>
        </div>

        <div className="ls-panel-strong flex min-h-0 flex-col p-4 sm:p-6">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-widest">
            {t('leaderboard', { defaultValue: 'Leaderboard' })}
          </h3>
          <LeaderboardPanel refreshKey={leaderboardKey} />
        </div>
      </div>
    </div>
  );
}
