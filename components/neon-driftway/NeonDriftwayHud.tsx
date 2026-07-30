'use client';

/**
 * The in-run HUD.
 *
 * Everything here is written imperatively from the game loop — `textContent`
 * and inline styles, never React state — so a 120 Hz frame never re-renders
 * the tree. The parent calls {@link HudHandle.sync} once per frame from the
 * single rAF loop it already owns.
 *
 * In stereo mode the same markup is rendered twice, once per eye, and every
 * lookup is `querySelectorAll`, so a write lands in both panels without the
 * caller knowing which mode is on. Sizes are `em` off a viewport-derived root
 * font size, which keeps the HUD legible from a 320px phone to an ultrawide
 * and shrinks it sensibly when each eye only owns half the panel.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NeonDriftwayEngine } from '@/lib/neon-driftway/game';
import { BOOST_MAX, KMH_PER_UNIT, STREAK_WINDOW_MS, V_MAX_NORMAL } from '@/lib/neon-driftway/constants';

const MAX_HP_PIPS = 3;
const MAX_ABILITY_PIPS = 3;
const SCOREBOARD_ROWS = 6;
const POPUP_SLOTS = 5;

export interface HudSyncOptions {
  multiplayer: boolean;
  /** Label used for the local player on the multiplayer scoreboard. */
  selfLabel: string;
}

export interface HudHandle {
  sync(game: NeonDriftwayEngine, options: HudSyncOptions): void;
}

interface Props {
  /** Render two panels, one per eye, for a phone viewer. */
  stereo: boolean;
  /** Hidden between runs so menus own the screen. */
  visible: boolean;
}

function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export const NeonDriftwayHud = forwardRef<HudHandle, Props>(function NeonDriftwayHud(
  { stereo, visible },
  ref,
) {
  const { t } = useTranslation('c-neon-driftway');
  const rootRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, HTMLElement[]>());

  // The markup changes shape when stereo toggles, so the element cache has to go.
  useEffect(() => {
    cache.current.clear();
  }, [stereo]);

  useImperativeHandle(ref, (): HudHandle => {
    const find = (name: string): HTMLElement[] => {
      const hit = cache.current.get(name);
      if (hit) return hit;
      const root = rootRef.current;
      if (!root) return [];
      const found = Array.from(root.querySelectorAll<HTMLElement>(`[data-hud="${name}"]`));
      cache.current.set(name, found);
      return found;
    };

    const write = (name: string, text: string) => {
      for (const el of find(name)) {
        if (el.textContent !== text) el.textContent = text;
      }
    };

    const show = (name: string, on: boolean) => {
      for (const el of find(name)) {
        const next = on ? '' : 'none';
        if (el.style.display !== next) el.style.display = next;
      }
    };

    return {
      sync(game, options) {
        if (!rootRef.current) return;
        const car = game.car;
        const playing = game.state === 'playing' || game.state === 'paused';

        show('run', playing);
        write('score', Math.round(game.score).toLocaleString());
        write('distance', `${Math.round(game.distance).toLocaleString()} m`);
        write('time', formatClock(game.elapsedMs));
        write('speed', String(Math.round(car.speed * KMH_PER_UNIT)));

        for (const el of find('speed')) {
          el.style.color = car.speed > V_MAX_NORMAL ? '#ff6b6b' : '#ffffff';
        }

        // Health pips: levels differ in max HP, so trim the row to fit.
        const pips = find('hp-pip');
        for (let i = 0; i < pips.length; i++) {
          const index = i % MAX_HP_PIPS;
          pips[i].style.display = index < car.maxHp ? '' : 'none';
          pips[i].style.opacity = index < car.hp ? '1' : '0.22';
        }

        for (const el of find('boost-fill')) {
          el.style.width = `${(car.boostMeter / BOOST_MAX) * 100}%`;
          el.style.background = car.boostMeter > BOOST_MAX * 0.3 ? '#ff9d2e' : '#ff4d2e';
        }

        const streaking = game.closeCallStreak > 1
          && game.elapsedMs - game.lastCloseCallTime < STREAK_WINDOW_MS;
        show('streak', streaking);
        if (streaking) write('streak-value', `×${game.closeCallStreak}`);

        show('grip', game.level.gripEnabled && game.grip < 1);
        show('slowed', game.isSlowed);

        // Countdown owns the screen before the flag drops.
        const counting = game.state === 'countdown';
        show('countdown', counting);
        if (counting) {
          const n = Math.ceil(game.countdownTimer);
          write('countdown-value', n > 0 ? String(n) : t('countdown-go', { defaultValue: 'GO!' }));
        }

        show('paused', game.state === 'paused');

        // Multiplayer extras.
        show('ability', options.multiplayer);
        if (options.multiplayer) {
          const charges = find('ability-pip');
          for (let i = 0; i < charges.length; i++) {
            charges[i].style.opacity = (i % MAX_ABILITY_PIPS) < car.abilityCharges ? '1' : '0.2';
          }
        }

        show('scoreboard', options.multiplayer && playing);
        if (options.multiplayer && playing) {
          const entries: { name: string; score: number; self: boolean }[] = [
            { name: options.selfLabel, score: Math.round(game.score), self: true },
          ];
          for (const [, remote] of game.remotePlayers) {
            entries.push({ name: remote.name, score: Math.round(remote.score), self: false });
          }
          entries.sort((a, b) => b.score - a.score);

          const rows = find('score-row');
          const names = find('score-name');
          const values = find('score-value');
          for (let i = 0; i < rows.length; i++) {
            const entry = entries[i % SCOREBOARD_ROWS];
            if (!entry) {
              rows[i].style.display = 'none';
              continue;
            }
            rows[i].style.display = '';
            rows[i].style.color = entry.self ? '#22d3ee' : '#d4d4d8';
            if (names[i]) names[i].textContent = `${(i % SCOREBOARD_ROWS) + 1}. ${entry.name}`;
            if (values[i]) values[i].textContent = entry.score.toLocaleString();
          }
        }

        // Score popups, drawn from a fixed pool so nothing allocates per frame.
        const popupEls = find('popup');
        for (let i = 0; i < popupEls.length; i++) {
          const popup = game.popups[i % POPUP_SLOTS];
          const el = popupEls[i];
          if (!popup) {
            if (el.style.opacity !== '0') el.style.opacity = '0';
            continue;
          }
          const life = popup.maxLife > 0 ? popup.life / popup.maxLife : 0;
          el.textContent = popup.text;
          el.style.color = popup.color;
          el.style.opacity = String(Math.min(1, life * 2.5));
          el.style.transform = `translate(-50%, ${(1 - life) * -2.4}em)`;
          el.style.left = `${50 + popup.anchor * 26}%`;
        }
      },
    };
  }, [t]);

  const panel = (eye: 'left' | 'right' | 'mono') => (
    <div
      key={eye}
      className="relative h-full w-full overflow-hidden font-mono"
      style={{
        // One root size drives the whole panel; children are sized in em.
        fontSize: stereo ? 'clamp(7px, 1.55vmin, 12px)' : 'clamp(10px, 2vmin, 17px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Live run readouts */}
      <div data-hud="run" className="absolute inset-0">
        {/* Top left: score + distance */}
        <div
          className="absolute rounded bg-black/45 backdrop-blur-[2px]"
          style={{ top: '0.7em', left: '0.7em', padding: '0.45em 0.7em' }}
        >
          <div className="text-cyan-300 tabular-nums" style={{ fontSize: '1.15em', lineHeight: 1.25 }}>
            <span data-hud="score">0</span>
          </div>
          <div className="text-zinc-300 tabular-nums" style={{ fontSize: '0.82em' }}>
            <span data-hud="distance">0 m</span>
          </div>
        </div>

        {/* Top centre: clock */}
        <div
          className="absolute -translate-x-1/2 rounded bg-black/45 text-zinc-200 tabular-nums"
          style={{ top: '0.7em', left: '50%', padding: '0.3em 0.65em', fontSize: '0.95em' }}
        >
          <span data-hud="time">0:00</span>
        </div>

        {/* Top right: speed + health */}
        <div
          className="absolute rounded bg-black/45 text-right"
          style={{ top: '0.7em', right: '0.7em', padding: '0.45em 0.7em' }}
        >
          <div className="tabular-nums" style={{ fontSize: '1.15em', lineHeight: 1.25 }}>
            <span data-hud="speed" className="text-white">0</span>
            <span className="text-zinc-400" style={{ fontSize: '0.6em' }}> km/h</span>
          </div>
          <div className="flex justify-end" style={{ gap: '0.25em', marginTop: '0.25em' }}>
            {Array.from({ length: MAX_HP_PIPS }, (_, i) => (
              <span
                key={i}
                data-hud="hp-pip"
                className="inline-block rounded-full bg-red-500"
                style={{ width: '0.6em', height: '0.6em' }}
              />
            ))}
          </div>
        </div>

        {/* Multiplayer scoreboard */}
        <div
          data-hud="scoreboard"
          className="absolute rounded bg-black/45"
          style={{ top: '4.6em', right: '0.7em', padding: '0.4em 0.6em', minWidth: '9em', display: 'none' }}
        >
          {Array.from({ length: SCOREBOARD_ROWS }, (_, i) => (
            <div
              key={i}
              data-hud="score-row"
              className="flex justify-between tabular-nums"
              style={{ fontSize: '0.78em', gap: '0.8em' }}
            >
              <span data-hud="score-name" />
              <span data-hud="score-value" />
            </div>
          ))}
        </div>

        {/* Streak / grip / slowdown callouts */}
        <div
          className="absolute -translate-x-1/2 text-center"
          style={{ top: '3.4em', left: '50%' }}
        >
          <div data-hud="streak" className="font-bold text-yellow-300" style={{ display: 'none', fontSize: '0.95em' }}>
            {t('streak', { defaultValue: 'STREAK' })} <span data-hud="streak-value" />
          </div>
          <div data-hud="grip" className="font-bold text-red-400" style={{ display: 'none', fontSize: '0.9em' }}>
            {t('low-grip', { defaultValue: 'LOW GRIP' })}
          </div>
          <div data-hud="slowed" className="font-bold text-blue-300" style={{ display: 'none', fontSize: '0.9em' }}>
            {t('slowed', { defaultValue: 'SLOWED' })}
          </div>
        </div>

        {/* Score popups */}
        {Array.from({ length: POPUP_SLOTS }, (_, i) => (
          <div
            key={i}
            data-hud="popup"
            className="absolute whitespace-nowrap font-bold"
            style={{
              top: `${34 + i * 2.6}%`,
              left: '50%',
              opacity: 0,
              fontSize: '0.95em',
              transform: 'translate(-50%, 0)',
              textShadow: '0 0.1em 0.3em rgba(0,0,0,0.9)',
            }}
          />
        ))}

        {/* Bottom centre: boost meter */}
        <div
          className="absolute -translate-x-1/2"
          style={{ bottom: '1.1em', left: '50%', width: '11em' }}
        >
          <div className="text-center text-zinc-400" style={{ fontSize: '0.62em', marginBottom: '0.25em' }}>
            {t('boost', { defaultValue: 'BOOST' })}
          </div>
          <div className="overflow-hidden rounded-full bg-black/60" style={{ height: '0.5em' }}>
            <div data-hud="boost-fill" className="h-full" style={{ width: '0%', background: '#ff9d2e' }} />
          </div>
        </div>

        {/* Bottom left: ability charges */}
        <div
          data-hud="ability"
          className="absolute"
          style={{ bottom: '1.1em', left: '0.7em', display: 'none' }}
        >
          <div className="text-purple-300" style={{ fontSize: '0.62em' }}>
            {t('ability', { defaultValue: 'ABILITY' })}
          </div>
          <div className="flex" style={{ gap: '0.3em', marginTop: '0.25em' }}>
            {Array.from({ length: MAX_ABILITY_PIPS }, (_, i) => (
              <span
                key={i}
                data-hud="ability-pip"
                className="inline-block rounded-full bg-purple-400"
                style={{ width: '0.55em', height: '0.55em', opacity: 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Countdown */}
      <div
        data-hud="countdown"
        className="absolute inset-0 flex items-center justify-center"
        style={{ display: 'none' }}
      >
        <span
          data-hud="countdown-value"
          className="font-black text-white"
          style={{ fontSize: '4.5em', textShadow: '0 0.06em 0.25em rgba(0,0,0,0.85)' }}
        />
      </div>

      {/* Paused */}
      <div
        data-hud="paused"
        className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center"
        style={{ display: 'none' }}
      >
        <span className="font-black text-white" style={{ fontSize: '2.2em' }}>
          {t('paused', { defaultValue: 'PAUSED' })}
        </span>
        <span className="text-zinc-300" style={{ fontSize: '0.9em', marginTop: '0.4em' }}>
          {t('paused-hint', { defaultValue: 'Tap the screen or press Esc to resume' })}
        </span>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 select-none"
      style={{ display: visible ? undefined : 'none' }}
    >
      {stereo ? (
        <div className="flex h-full w-full">
          <div className="h-full w-1/2">{panel('left')}</div>
          <div className="h-full w-1/2">{panel('right')}</div>
        </div>
      ) : (
        panel('mono')
      )}
    </div>
  );
});
