'use client';

/**
 * Gabriel's Horn — front screen.
 *
 * Four ways in (quick table, host, join by code, browse) and, above them, the
 * one sentence that has to land before anything else: you cannot see your own
 * dice. A player who starts a table without having understood that spends the
 * first round thinking the game is broken, so the pitch says it and the rules
 * button sits right next to it.
 *
 * This is a document — a column you read top to bottom — so it uses `.app-page`
 * and scrolls the DOCUMENT rather than an inner box (components/CLAUDE.md
 * §Full-screen games/apps, rule 5).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, Dices, ListOrdered, Plus, Users } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS, MIRROR_NAME } from '@/lib/gabriels-horn/constants';
import { HornLeaderboard } from './Leaderboard';
import { HornButton, Panel } from './ui';

export function MainMenu({
  signedIn,
  connecting,
  onQuickTable,
  onHost,
  onJoinCode,
  onBrowse,
  onRules,
}: {
  signedIn: boolean;
  connecting: boolean;
  onQuickTable: () => void;
  onHost: () => void;
  onJoinCode: (code: string) => void;
  onBrowse: () => void;
  onRules: () => void;
}) {
  const { t } = useTranslation('c-gabriels-horn');
  const [code, setCode] = useState('');

  return (
    <div className="gh-scene app-page app-safe-x text-(--app-text)">
      <header className="app-safe-top px-4 pt-4">
        <Link
          to="/builds"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-2 py-1 text-xs text-(--app-text-muted) transition-colors hover:text-(--app-text)"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {t('back-to-games', { defaultValue: 'All games' })}
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md grow flex-col gap-4 px-4 py-6">
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-(--app-accent)">
            {t('title', { defaultValue: 'Gabriel’s Horn' })}
          </h1>
          <p className="mt-1 font-mono text-xs tracking-[0.3em] text-(--app-text-dim) uppercase">
            {MIRROR_NAME}
          </p>
          <p className="mt-3 text-sm text-(--app-text-muted)">
            {t('pitch', {
              defaultValue:
                'Three dice, and you are the one person who cannot see them. Ask the table. Decide who is lying. Whoever ends holding the fewest cards wins.',
            })}
          </p>
        </div>

        <HornButton variant="ghost" size="sm" onClick={onRules} className="self-center">
          <BookOpen className="size-4" aria-hidden="true" />
          {t('read-rules', { defaultValue: 'Read the rules' })}
        </HornButton>

        {!signedIn ? (
          <Panel className="text-center text-sm text-(--app-text-muted)">
            <p>
              {t('sign-in-required', {
                defaultValue:
                  'Gabriel’s Horn is played against other people, so it needs an account.',
              })}
            </p>
            <Link
              to="/login"
              search={{ callbackURL: '/gabriels-horn' }}
              className="mt-3 inline-flex w-full items-center justify-center rounded-[var(--app-radius-sm)] bg-(--app-accent) px-4 py-2.5 text-sm font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover)"
            >
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          </Panel>
        ) : (
          <>
            <div className="grid gap-2">
              <HornButton variant="primary" onClick={onQuickTable} disabled={connecting}>
                <Dices className="size-4" aria-hidden="true" />
                {t('quick-table', { defaultValue: 'Find a table' })}
              </HornButton>
              <div className="grid grid-cols-2 gap-2">
                <HornButton onClick={onHost} disabled={connecting}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t('host', { defaultValue: 'Host' })}
                </HornButton>
                <HornButton onClick={onBrowse} disabled={connecting}>
                  <Users className="size-4" aria-hidden="true" />
                  {t('browse', { defaultValue: 'Browse' })}
                </HornButton>
              </div>
            </div>

            <Panel>
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const clean = code.trim().toUpperCase();
                  if (clean) onJoinCode(clean);
                }}
              >
                <label className="sr-only" htmlFor="gh-code">
                  {t('join-code-label', { defaultValue: 'Table code' })}
                </label>
                <input
                  id="gh-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 8))}
                  placeholder={t('join-code-placeholder', { defaultValue: 'TABLE CODE' })}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="min-w-0 grow rounded-[var(--app-radius-sm)] border border-(--app-border) bg-(--app-bg-subtle) px-3 py-2 font-mono text-sm tracking-[0.2em] text-(--app-text) uppercase placeholder:text-(--app-text-dim) focus-visible:border-(--app-accent)"
                />
                <HornButton type="submit" disabled={connecting || !code.trim()}>
                  {t('join', { defaultValue: 'Join' })}
                </HornButton>
              </form>
            </Panel>
          </>
        )}

        <Panel>
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-(--app-text-muted) uppercase">
            <ListOrdered className="size-3.5" aria-hidden="true" />
            {t('leaderboard-title', { defaultValue: 'Most games won' })}
          </h2>
          <HornLeaderboard />
        </Panel>

        <p className="text-center text-xs text-(--app-text-dim)">
          {t('player-range', {
            defaultValue: '{{min}}–{{max}} players. Bluffing works better with more of them.',
            min: MIN_PLAYERS,
            max: MAX_PLAYERS,
          })}
        </p>
      </main>
    </div>
  );
}
