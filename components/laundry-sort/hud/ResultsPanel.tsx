'use client';

/**
 * End of round. Two shapes, one screen:
 *
 *  - **Solo** — your own numbers, whether it beat your best, and the state of
 *    the score submission (which is worth showing: a failed POST that silently
 *    swallows a personal best is the worst possible outcome here).
 *  - **Versus** — the standings the server computed, with ties sharing a place.
 *
 * Both offer the same two exits: go again, or back to the menu.
 */

import { useTranslation } from 'react-i18next';
import { Medal, RotateCcw, Home, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useLaundryStore } from '@/lib/laundry-sort/store';
import { laundryNet } from '@/lib/laundry-sort/net/client';

const PLACE_COLOR = ['var(--ls-warn)', '#cbd5e1', '#d08a52'];

export function ResultsPanel({
  onPlayAgain,
  onMenu,
}: {
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  const { t } = useTranslation('c-laundry-sort');
  const mode = useLaundryStore((s) => s.mode);
  const results = useLaundryStore((s) => s.results);
  const soloResult = useLaundryStore((s) => s.soloResult);
  const selfSocketId = useLaundryStore((s) => s.selfSocketId);
  const lobby = useLaundryStore((s) => s.lobby);

  const isVersus = mode === 'versus' && results !== null;

  return (
    <div className="ls-overlay z-40 bg-black/65 backdrop-blur-[2px]">
      <div className="mx-auto flex min-h-full w-full flex-col justify-center max-w-2xl p-3 sm:p-6">
        <div className="ls-panel-strong space-y-4 p-4 sm:p-6">
          <h2 className="text-center text-2xl font-black tracking-tight">
            {isVersus
              ? t('race-over', { defaultValue: 'Race over' })
              : t('round-over', { defaultValue: 'Round over' })}
          </h2>

          {isVersus ? (
            <ol className="space-y-1.5">
              {results.standings.map((entry) => {
                const isSelf = entry.socketId === selfSocketId;
                return (
                  <li
                    key={entry.socketId}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                      isSelf ? 'bg-[var(--ls-accent)]/10 font-bold' : 'bg-white/[0.04]'
                    }`}
                  >
                    <span
                      className="ls-numeric w-6 shrink-0 text-center text-lg font-black"
                      style={{ color: PLACE_COLOR[entry.place - 1] ?? 'var(--ls-muted)' }}
                    >
                      {entry.place}
                    </span>
                    <UserAvatar
                      src={entry.avatarUrl}
                      alt=""
                      fallbackName={entry.name}
                      size={24}
                      className="shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="ls-muted shrink-0 text-[11px]">
                      {t('sorted-count', { defaultValue: '{{count}} sorted', count: entry.sorted })}
                    </span>
                    <span className="ls-accent ls-numeric shrink-0 font-black">
                      {entry.score.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : soloResult ? (
            <div className="space-y-3">
              <p className="ls-numeric text-center text-5xl font-black">
                {soloResult.stats.score.toLocaleString()}
              </p>

              {soloResult.personalBest ? (
                <p className="ls-accent flex items-center justify-center gap-1.5 text-sm font-bold">
                  <Medal className="size-4" aria-hidden="true" />
                  {t('personal-best', { defaultValue: 'New personal best' })}
                </p>
              ) : null}

              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Stat
                  label={t('sorted', { defaultValue: 'Sorted' })}
                  value={soloResult.stats.sorted}
                />
                <Stat
                  label={t('wrong-bin', { defaultValue: 'Wrong bin' })}
                  value={soloResult.stats.wrong}
                />
                <Stat
                  label={t('missed', { defaultValue: 'Missed' })}
                  value={soloResult.stats.missed}
                />
                <Stat
                  label={t('best-combo', { defaultValue: 'Best combo' })}
                  value={soloResult.stats.bestCombo}
                />
              </dl>

              {soloResult.submitted === 'pending' ? (
                <p className="ls-muted text-center text-xs">
                  {t('submitting-score', { defaultValue: 'Saving score…' })}
                </p>
              ) : null}
              {soloResult.submitted === 'done' ? (
                <p className="ls-muted text-center text-xs">
                  {t('score-submitted', { defaultValue: 'Score saved' })}
                </p>
              ) : null}
              {soloResult.submitted === 'error' ? (
                <p
                  className="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--ls-danger)]"
                  role="alert"
                >
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {t('score-not-saved', {
                    defaultValue: "Couldn't save that score — the run still counted locally.",
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              onClick={() => {
                if (isVersus) laundryNet.rematch();
                onPlayAgain();
              }}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              {isVersus
                ? t('rematch', { defaultValue: 'Rematch' })
                : t('play-again', { defaultValue: 'Play again' })}
            </Button>
            <Button size="lg" variant="outline" onClick={onMenu}>
              <Home className="size-4" aria-hidden="true" />
              {t('back-to-menu', { defaultValue: 'Back to menu' })}
            </Button>
          </div>

          {isVersus && lobby ? (
            <p className="ls-muted text-center text-xs">
              {t('rematch-hint', {
                defaultValue: 'Rematch keeps the room open — code {{code}}.',
                code: lobby.code,
              })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-white/[0.04] px-2.5 py-2 text-center">
      <dt className="ls-muted text-[10px] font-semibold uppercase tracking-widest">{label}</dt>
      <dd className="ls-numeric text-lg font-black">{value}</dd>
    </div>
  );
}
