'use client';

/**
 * Nightrail — the in-run HUD.
 *
 * Written imperatively from the game loop: `textContent` and inline styles,
 * never React state, so the 120 Hz sim can push a fresh readout every frame
 * without re-rendering a single node. The parent owns the one rAF loop in the
 * game and calls {@link HudHandle.sync} from it.
 *
 * Two things make that cheap. Elements are found once by their `data-hud`
 * attribute and cached in a `Map` — the markup shape never changes here, so a
 * lookup can never go stale. And every write is diffed first: assigning the
 * same string back to `textContent` still dirties the node and costs a layout
 * pass, and at 120 Hz across a dozen readouts that is the whole frame budget
 * spent on values that did not move.
 *
 * Sizes are `em` off one viewport-derived root font size, which keeps the HUD
 * legible from a 320px phone to an ultrawide without a single media query.
 */

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunState } from '@/lib/nightrail/game';
import { runProgress } from '@/lib/nightrail/game';
import { MAX_MULTIPLIER } from '@/lib/nightrail/constants';

/** Pips rendered for cargo. Levels carry fewer; the surplus is hidden. */
const CARGO_PIPS = 8;
/** Popup slots. Fixed pool — the HUD never allocates a node mid-run. */
const POPUP_SLOTS = 6;
/** How many trick names of the live combo stay on screen. */
const CHAIN_SLOTS = 5;

/** Beyond this the grind is about to bail, so the meter goes hot. */
const BALANCE_DANGER = 0.68;

export interface HudHandle {
  sync(state: RunState): void;
}

interface Props {
  /** Hidden between runs so the menus own the screen. */
  visible: boolean;
}

export const NightrailHud = forwardRef<HudHandle, Props>(function NightrailHud({ visible }, ref) {
  const { t } = useTranslation('c-nightrail');
  const rootRef = useRef<HTMLDivElement>(null);
  const cache = useRef(new Map<string, HTMLElement[]>());

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

    /** Scale a bar horizontally. Compositor-only, so it never triggers layout. */
    const fill = (name: string, amount: number) => {
      const next = `scaleX(${Math.max(0, Math.min(1, amount)).toFixed(3)})`;
      for (const el of find(name)) {
        if (el.style.transform !== next) el.style.transform = next;
      }
    };

    const tint = (name: string, color: string) => {
      for (const el of find(name)) {
        if (el.style.color !== color) el.style.color = color;
      }
    };

    return {
      sync(state) {
        if (!rootRef.current) return;
        const { train, combo } = state;

        // Pause is read off `phase` rather than passed in as a second
        // argument, because the sim is already the one deciding whether time
        // passes — asking it is cheaper than keeping a copy in sync.
        const phase = state.phase;
        const paused = phase === 'paused';
        const live = phase === 'playing' || phase === 'countdown' || paused;

        show('run', live);
        if (!live) return;

        write('score', Math.round(state.score).toLocaleString());
        write('speed', String(Math.round(train.speed * 3.6)));
        // Boost is the only thing that pushes past the level cap, so it is
        // worth calling out in the one readout the player already watches.
        tint('speed', train.boostTime > 0 ? '#fbbf24' : '#ffffff');

        // Cargo doubles as the health bar: crates are what a crash costs.
        const pips = find('cargo-pip');
        for (let i = 0; i < pips.length; i++) {
          const present = i < train.maxCargo ? '' : 'none';
          if (pips[i].style.display !== present) pips[i].style.display = present;
          const opacity = i < train.cargo ? '1' : '0.18';
          if (pips[i].style.opacity !== opacity) pips[i].style.opacity = opacity;
        }

        fill('boost-fill', train.boostMeter);
        fill('progress-fill', runProgress(state));

        // Drift charge only exists while a drift is being held, and showing an
        // empty ring the rest of the time trains players to ignore it.
        const drifting = train.mode === 'drifting';
        show('drift', drifting);
        if (drifting) {
          fill('drift-fill', train.driftCharge);
          tint('drift-label', train.driftCharge >= 1 ? '#fde047' : '#67e8f9');
        }

        // Grind balance is an active skill check with a fail state a second
        // away, so it gets the middle of the screen rather than a corner.
        const grinding = train.mode === 'grinding';
        show('grind', grinding);
        if (grinding) {
          const balance = Math.max(-1, Math.min(1, train.grindBalance));
          const hot = Math.abs(balance) > BALANCE_DANGER;
          for (const el of find('grind-needle')) {
            const next = `translate(-50%, 0)`;
            if (el.style.transform !== next) el.style.transform = next;
            const left = `${50 + balance * 46}%`;
            if (el.style.left !== left) el.style.left = left;
            const color = hot ? '#fb7185' : '#34d399';
            if (el.style.background !== color) el.style.background = color;
          }
          tint('grind-label', hot ? '#fb7185' : '#a7f3d0');
          write('grind-time', `${train.grindTime.toFixed(1)}s`);
        }

        // A combo that is not running should leave no trace — an idle "×1"
        // reads as a live multiplier and makes the real one worth less.
        const comboAlive = combo.chain.length > 0 || combo.pending > 0;
        show('combo', comboAlive);
        if (comboAlive) {
          write('combo-mult', `×${combo.multiplier.toFixed(1)}`);
          write('combo-pending', Math.round(combo.pending).toLocaleString());
          fill('combo-fill', combo.multiplier / MAX_MULTIPLIER);
          tint('combo-mult', combo.multiplier >= MAX_MULTIPLIER ? '#fde047' : '#e9d5ff');

          // Newest trick on top: it is the one that just paid out.
          const rows = find('chain-row');
          for (let i = 0; i < rows.length; i++) {
            const name = combo.chain[combo.chain.length - 1 - i];
            if (!name) {
              if (rows[i].style.display !== 'none') rows[i].style.display = 'none';
              continue;
            }
            if (rows[i].style.display !== '') rows[i].style.display = '';
            if (rows[i].textContent !== name) rows[i].textContent = name;
            const opacity = String(Math.max(0.25, 1 - i * 0.19));
            if (rows[i].style.opacity !== opacity) rows[i].style.opacity = opacity;
          }
        }

        const counting = phase === 'countdown';
        show('countdown', counting);
        if (counting) {
          const n = Math.ceil(state.countdown);
          write('countdown-value', n > 0 ? String(n) : t('countdown-go', { defaultValue: 'GO!' }));
        }

        show('paused', paused);

        // Popups come from a fixed pool, so a burst of cash-outs allocates
        // nothing and the oldest slot is simply reused.
        const popupEls = find('popup');
        for (let i = 0; i < popupEls.length; i++) {
          const popup = state.popups[i];
          const el = popupEls[i];
          if (!popup) {
            if (el.style.opacity !== '0') el.style.opacity = '0';
            continue;
          }
          const life = popup.maxLife > 0 ? popup.life / popup.maxLife : 0;
          if (el.textContent !== popup.text) el.textContent = popup.text;
          if (el.style.color !== popup.color) el.style.color = popup.color;
          el.style.opacity = String(Math.min(1, life * 2.6));
          el.style.left = `${50 + popup.anchor * 40}%`;
          el.style.fontSize = `${(0.95 * Math.min(2, Math.max(1, popup.emphasis))).toFixed(2)}em`;
          el.style.transform = `translate(-50%, ${(1 - life) * -2.6}em)`;
        }
      },
    };
  }, [t]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-30 select-none"
      style={{ display: visible ? undefined : 'none' }}
    >
      <div
        className="relative h-full w-full overflow-hidden font-mono"
        style={{
          // One root size drives the whole HUD; every child is sized in em.
          fontSize: 'clamp(10px, 2vmin, 17px)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div data-hud="run" className="absolute inset-0">
          {/* Top left — score, then the live combo stacked beneath it */}
          <div className="absolute" style={{ top: '0.7em', left: '0.7em' }}>
            <div
              className="rounded bg-slate-950/55 backdrop-blur-[2px]"
              style={{ padding: '0.4em 0.7em' }}
            >
              <div
                className="text-[0.6em] font-bold uppercase tracking-[0.18em] text-sky-300/70"
                style={{ lineHeight: 1.4 }}
              >
                {t('score', { defaultValue: 'Score' })}
              </div>
              <div
                className="text-cyan-200 tabular-nums"
                style={{ fontSize: '1.25em', lineHeight: 1.2 }}
              >
                <span data-hud="score">0</span>
              </div>
            </div>

            <div
              data-hud="combo"
              className="rounded bg-slate-950/55 backdrop-blur-[2px]"
              style={{
                display: 'none',
                marginTop: '0.4em',
                padding: '0.4em 0.7em',
                minWidth: '8.5em',
              }}
            >
              <div className="flex items-baseline" style={{ gap: '0.45em' }}>
                <span
                  data-hud="combo-mult"
                  className="font-black text-purple-200 tabular-nums"
                  style={{ fontSize: '1.35em', lineHeight: 1 }}
                >
                  ×1.0
                </span>
                <span className="text-fuchsia-300/90 tabular-nums" style={{ fontSize: '0.8em' }}>
                  +<span data-hud="combo-pending">0</span>
                </span>
              </div>

              {/* Multiplier headroom against the hard cap */}
              <div
                className="overflow-hidden rounded-full bg-slate-800/80"
                style={{ height: '0.22em', marginTop: '0.3em' }}
              >
                <div
                  data-hud="combo-fill"
                  className="h-full origin-left bg-linear-to-r from-fuchsia-500 to-amber-300"
                  style={{ transform: 'scaleX(0)' }}
                />
              </div>

              <div style={{ marginTop: '0.35em' }}>
                {Array.from({ length: CHAIN_SLOTS }, (_, i) => (
                  <div
                    key={i}
                    data-hud="chain-row"
                    className="whitespace-nowrap text-fuchsia-100"
                    style={{ display: 'none', fontSize: '0.72em', lineHeight: 1.5 }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Top centre — how much track is left */}
          <div
            className="absolute -translate-x-1/2"
            style={{ top: '0.8em', left: '50%', width: '13em' }}
          >
            <div
              className="text-center text-[0.58em] font-bold uppercase tracking-[0.22em] text-slate-400"
              style={{ marginBottom: '0.35em' }}
            >
              {t('line', { defaultValue: 'Line' })}
            </div>
            <div
              className="overflow-hidden rounded-full bg-slate-950/70"
              style={{ height: '0.32em' }}
            >
              <div
                data-hud="progress-fill"
                className="h-full origin-left bg-linear-to-r from-sky-400 to-cyan-200"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
          </div>

          {/* Top right — speed and the cargo you still have to lose */}
          <div
            className="absolute rounded bg-slate-950/55 text-right backdrop-blur-[2px]"
            style={{ top: '0.7em', right: '0.7em', padding: '0.4em 0.7em' }}
          >
            <div className="tabular-nums" style={{ fontSize: '1.25em', lineHeight: 1.2 }}>
              <span data-hud="speed" className="text-white">
                0
              </span>
              <span className="text-slate-400" style={{ fontSize: '0.55em' }}>
                {' '}
                {t('kmh', { defaultValue: 'km/h' })}
              </span>
            </div>
            <div className="flex justify-end" style={{ gap: '0.22em', marginTop: '0.35em' }}>
              {Array.from({ length: CARGO_PIPS }, (_, i) => (
                <span
                  key={i}
                  data-hud="cargo-pip"
                  className="inline-block rounded-[2px] bg-amber-400"
                  style={{ width: '0.52em', height: '0.62em' }}
                />
              ))}
            </div>
            <div
              className="text-[0.55em] font-bold uppercase tracking-[0.18em] text-amber-300/70"
              style={{ marginTop: '0.25em' }}
            >
              {t('cargo', { defaultValue: 'Cargo' })}
            </div>
          </div>

          {/* Score popups */}
          {Array.from({ length: POPUP_SLOTS }, (_, i) => (
            <div
              key={i}
              data-hud="popup"
              className="absolute whitespace-nowrap font-black"
              style={{
                top: `${32 + i * 2.8}%`,
                left: '50%',
                opacity: 0,
                fontSize: '0.95em',
                transform: 'translate(-50%, 0)',
                textShadow: '0 0.1em 0.3em rgba(2,6,23,0.95)',
              }}
            />
          ))}

          {/* Grind balance — centre stage, because it is a live failure state */}
          <div
            data-hud="grind"
            className="absolute -translate-x-1/2 text-center"
            style={{ display: 'none', bottom: '5.6em', left: '50%', width: '20em' }}
          >
            <div className="flex items-baseline justify-center" style={{ gap: '0.5em' }}>
              <span
                data-hud="grind-label"
                className="font-bold uppercase tracking-[0.25em] text-emerald-200"
                style={{ fontSize: '0.7em' }}
              >
                {t('balance', { defaultValue: 'Balance' })}
              </span>
              <span
                data-hud="grind-time"
                className="text-emerald-300/80 tabular-nums"
                style={{ fontSize: '0.7em' }}
              >
                0.0s
              </span>
            </div>
            <div
              className="relative rounded-full bg-linear-to-r from-rose-600/60 via-slate-900/80 to-rose-600/60"
              style={{ height: '0.55em', marginTop: '0.3em' }}
            >
              {/* Centre tick: the only place the grind is actually stable. */}
              <span
                className="absolute top-0 h-full -translate-x-1/2 bg-white/25"
                style={{ left: '50%', width: '0.1em' }}
              />
              <span
                data-hud="grind-needle"
                className="absolute rounded-full bg-emerald-400"
                style={{
                  left: '50%',
                  top: '-0.18em',
                  width: '0.42em',
                  height: '0.91em',
                  transform: 'translate(-50%, 0)',
                }}
              />
            </div>
          </div>

          {/* Bottom centre — boost, with the drift charge riding above it */}
          <div
            className="absolute -translate-x-1/2 text-center"
            style={{ bottom: '1.1em', left: '50%', width: '13em' }}
          >
            <div data-hud="drift" style={{ display: 'none', marginBottom: '0.5em' }}>
              <div
                data-hud="drift-label"
                className="font-bold uppercase tracking-[0.25em] text-cyan-300"
                style={{ fontSize: '0.6em', marginBottom: '0.22em' }}
              >
                {t('drift', { defaultValue: 'Drift' })}
              </div>
              <div
                className="overflow-hidden rounded-full bg-slate-950/70"
                style={{ height: '0.4em' }}
              >
                <div
                  data-hud="drift-fill"
                  className="h-full origin-left bg-linear-to-r from-cyan-400 to-yellow-200"
                  style={{ transform: 'scaleX(0)' }}
                />
              </div>
            </div>

            <div
              className="font-bold uppercase tracking-[0.25em] text-orange-300/80"
              style={{ fontSize: '0.58em', marginBottom: '0.22em' }}
            >
              {t('boost', { defaultValue: 'Boost' })}
            </div>
            <div
              className="overflow-hidden rounded-full bg-slate-950/70"
              style={{ height: '0.45em' }}
            >
              <div
                data-hud="boost-fill"
                className="h-full origin-left bg-linear-to-r from-orange-500 to-amber-300"
                style={{ transform: 'scaleX(0)' }}
              />
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
            style={{ fontSize: '4.5em', textShadow: '0 0.06em 0.28em rgba(2,6,23,0.9)' }}
          />
        </div>

        {/* Paused */}
        <div
          data-hud="paused"
          className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-center"
          style={{ display: 'none' }}
        >
          <span className="font-black text-white" style={{ fontSize: '2.2em' }}>
            {t('paused', { defaultValue: 'PAUSED' })}
          </span>
          <span className="text-slate-300" style={{ fontSize: '0.9em', marginTop: '0.4em' }}>
            {t('paused-hint', { defaultValue: 'Tap the screen or press Esc to resume' })}
          </span>
        </div>
      </div>
    </div>
  );
});
