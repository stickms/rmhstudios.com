/**
 * The middle of the screen: the crosshair (style, colour and size from the
 * settings), floating damage numbers (hud_combattext), and the Sniper's scope
 * — black outside the lens, the reticle, and the charge meter beside it.
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { CrosshairStyle } from '@/lib/tf2-game/client/settings';
import type { HudDamageNumber } from '@/lib/tf2-game/client/hud-state';
import { useHudContext } from '../use-hud';

export function CrosshairGlyph({ style, color, size }: { style: CrosshairStyle; color: string; size: number }) {
  if (style === 'none') return null;
  const s = size;
  const c = s / 2;
  const gap = s * 0.16;
  const len = s * 0.3;
  const lines = (stroke: string, width: number) => (
    <g stroke={stroke} strokeWidth={width} strokeLinecap="square">
      <line x1={c} y1={c - gap - len} x2={c} y2={c - gap} />
      <line x1={c} y1={c + gap} x2={c} y2={c + gap + len} />
      <line x1={c - gap - len} y1={c} x2={c - gap} y2={c} />
      <line x1={c + gap} y1={c} x2={c + gap + len} y2={c} />
    </g>
  );
  return (
    <svg className="tf2g-crosshair" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {style === 'cross' || style === 'cross-dot' ? (
        <>
          {lines('rgb(0 0 0 / 0.55)', 3.5)}
          {lines(color, 1.6)}
        </>
      ) : null}
      {style === 'circle' ? (
        <>
          <circle cx={c} cy={c} r={s * 0.28} fill="none" stroke="rgb(0 0 0 / 0.55)" strokeWidth={3.5} />
          <circle cx={c} cy={c} r={s * 0.28} fill="none" stroke={color} strokeWidth={1.6} />
        </>
      ) : null}
      {style === 'dot' || style === 'cross-dot' || style === 'circle' ? (
        <>
          <circle cx={c} cy={c} r={2.6} fill="rgb(0 0 0 / 0.55)" />
          <circle cx={c} cy={c} r={1.5} fill={color} />
        </>
      ) : null}
    </svg>
  );
}

export function Crosshair({ hidden }: { hidden: boolean }) {
  const { settings } = useHudContext();
  if (hidden) return null;
  const ch = settings.crosshair;
  return <CrosshairGlyph style={ch.style} color={ch.color} size={Math.round(32 * ch.scale)} />;
}

export function DamageNumbers({ numbers }: { numbers: HudDamageNumber[] }) {
  const { settings } = useHudContext();
  if (!settings.damageNumbers || numbers.length === 0) return null;
  return (
    <div aria-hidden="true">
      {numbers.map((d) => {
        // Unprojected numbers stack beside the crosshair, nudged apart by id.
        const jx = ((d.id * 37) % 40) - 20;
        const x = d.screen ? `${d.screen.x * 100}%` : `calc(50% + ${30 + jx}px)`;
        const y = d.screen ? `${d.screen.y * 100}%` : `calc(50% - ${24 + ((d.id * 13) % 16)}px)`;
        return (
          <span key={d.id} className="tf2g-damage" data-crit={d.crit} style={{ left: x, top: y }}>
            -{d.amount}
          </span>
        );
      })}
    </div>
  );
}

/** The scope: everything outside the lens is black, a thin reticle crosses it, the charge rises beside it. */
export function ScopeOverlay({ charge }: { charge: number | null }) {
  const { t } = useTranslation('c-tf2-game');
  const { screen } = useHudContext();
  const w = screen.w;
  const h = screen.h;
  const r = Math.min(w, h) * 0.49;
  const cx = w / 2;
  const cy = h / 2;
  const thin = Math.max(1, h / 720);
  const thick = Math.max(2, h / 220);
  return (
    <>
      <svg className="tf2g-scope" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id="tf2g-scope-edge" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0.9" stopColor="rgb(0 0 0)" stopOpacity="0" />
            <stop offset="1" stopColor="rgb(0 0 0)" stopOpacity="0.85" />
          </radialGradient>
          <mask id="tf2g-scope-hole">
            <rect width={w} height={h} fill="white" />
            <circle cx={cx} cy={cy} r={r} fill="black" />
          </mask>
        </defs>
        <rect width={w} height={h} fill="rgb(0 0 0)" mask="url(#tf2g-scope-hole)" />
        <circle cx={cx} cy={cy} r={r} fill="url(#tf2g-scope-edge)" />
        <g stroke="rgb(0 0 0)" strokeLinecap="butt">
          <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} strokeWidth={thin} />
          <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} strokeWidth={thin} />
          <line x1={cx - r} y1={cy} x2={cx - r * 0.42} y2={cy} strokeWidth={thick} />
          <line x1={cx + r * 0.42} y1={cy} x2={cx + r} y2={cy} strokeWidth={thick} />
          <line x1={cx} y1={cy + r * 0.42} x2={cx} y2={cy + r} strokeWidth={thick} />
        </g>
      </svg>
      {charge !== null ? (
        <div
          className="tf2g-scope-charge"
          data-full={charge >= 1}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(charge * 100)}
          aria-label={t('sniper_charge', { defaultValue: 'Rifle charge' })}
        >
          <span style={{ height: `${Math.round(charge * 100)}%` }} />
        </div>
      ) : null}
    </>
  );
}
