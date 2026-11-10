/**
 * CoopHud — the co-op overlay over the match canvas: shared kills and clock,
 * and one row per player (name, class colour, level, HP, downed / dead state).
 * Pure presentation; MultiplayerGameScreen feeds it ~7 times a second from the
 * newest snapshot, so it never re-renders per frame.
 */

import { Skull, Swords } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PLAYER_ALIVE, PLAYER_DOWNED, PLAYER_DEAD } from '@features/altair/engine/multiplayer/types';

export interface CoopHudPlayer {
  playerId: string;
  name: string;
  color: string;
  level: number;
  hp: number;
  maxHp: number;
  state: 0 | 1 | 2;
  downTimer: number;
  levelUpPending: boolean;
  isLocal: boolean;
}

export interface CoopHudSelf {
  state: 0 | 1 | 2;
  downTimer: number;
  /** Name of the teammate the camera follows while this player is dead. */
  spectating: string | null;
}

export interface CoopHudBoss {
  name: string;
  title: string;
  hpFrac: number;
  color: string;
}

interface CoopHudProps {
  self: CoopHudSelf;
  players: CoopHudPlayer[];
  sharedKills: number;
  time: number;
  boss: CoopHudBoss | null;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CoopHud({ self, players, sharedKills, time, boss }: CoopHudProps) {
  const { t } = useTranslation('c-altair');

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-3"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <ul className="flex w-44 flex-col gap-1.5 sm:w-56" aria-label={t('coop-team', { defaultValue: 'Team' })}>
        {players.map((p) => {
          const frac = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
          const down = p.state === PLAYER_DOWNED;
          const dead = p.state === PLAYER_DEAD;
          return (
            <li
              key={p.playerId}
              data-testid="coop-hud-player"
              data-player-id={p.playerId}
              data-state={dead ? 'dead' : down ? 'downed' : 'alive'}
              className="rounded-(--altair-radius) border border-(--altair-border) bg-(--altair-hud-scrim) px-2 py-1"
              style={{ borderLeft: `3px solid ${p.color}` }}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold" style={{ color: p.color }}>
                  {p.name}
                  {p.isLocal ? ` (${t('coop-you', { defaultValue: 'you' })})` : ''}
                </span>
                <span className="shrink-0 font-mono text-(--altair-text-muted)">
                  {dead ? (
                    <Skull size={12} aria-label={t('coop-dead', { defaultValue: 'Dead' })} />
                  ) : p.levelUpPending ? (
                    t('coop-choosing', { defaultValue: 'Choosing...' })
                  ) : down ? (
                    t('coop-downed-timer', { defaultValue: 'Down {{seconds}}s', seconds: Math.max(0, Math.ceil(p.downTimer)) })
                  ) : (
                    t('coop-level', { defaultValue: 'Lv {{level}}', level: p.level })
                  )}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--altair-surface)">
                <div
                  className="h-full origin-left"
                  style={{
                    transform: `scaleX(${dead ? 0 : frac})`,
                    backgroundColor: down ? 'var(--altair-danger)' : frac > 0.5 ? 'var(--altair-success)' : frac > 0.25 ? 'var(--altair-warning)' : 'var(--altair-danger)',
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-3 rounded-(--altair-radius) border border-(--altair-border) bg-(--altair-hud-scrim) px-3 py-1 font-mono text-sm text-(--altair-text)">
          <span data-testid="coop-time">{formatTime(time)}</span>
          <span className="flex items-center gap-1">
            <Swords size={14} aria-hidden="true" />
            <span data-testid="coop-kills">{sharedKills}</span>
            <span className="sr-only">{t('coop-kills', { defaultValue: 'team kills' })}</span>
          </span>
        </div>
        {boss && (
          <div className="w-56 sm:w-80" data-testid="coop-boss">
            <div className="text-center text-xs font-bold tracking-wider" style={{ color: boss.color }}>
              {boss.name}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-(--altair-surface)">
              <div className="h-full origin-left" style={{ transform: `scaleX(${boss.hpFrac})`, backgroundColor: boss.color }} />
            </div>
          </div>
        )}
      </div>

      <div className="w-44 sm:w-56" aria-hidden="true" />

      {self.state !== PLAYER_ALIVE && (
        <div
          role="status"
          data-testid="coop-self-state"
          className="absolute inset-x-0 mx-auto w-fit max-w-[90vw] rounded-(--altair-radius) border border-(--altair-danger) bg-(--altair-hud-scrim) px-4 py-2 text-center text-sm text-(--altair-text)"
          style={{ top: '5.5rem' }}
        >
          {self.state === PLAYER_DOWNED
            ? t('coop-you-downed', {
                defaultValue: 'You are down. Stay put: a teammate can revive you ({{seconds}}s left).',
                seconds: Math.max(0, Math.ceil(self.downTimer)),
              })
            : self.spectating
              ? t('coop-spectating', { defaultValue: 'You are out. Watching {{name}}.', name: self.spectating })
              : t('coop-you-dead', { defaultValue: 'You are out.' })}
        </div>
      )}
    </div>
  );
}
