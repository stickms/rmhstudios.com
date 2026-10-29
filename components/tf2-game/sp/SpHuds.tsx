/**
 * Half-Life 2's and Portal's HUDs.
 *
 * HL2: the suit panels in amber on smoked-glass rounded boxes — HEALTH and
 * SUIT bottom left, AUX POWER above them (segmented, with what is draining
 * it), AMMO and ALT bottom right, pickups listed top right, red damage arcs at
 * the edges, the quick-info crosshair (health and ammo brackets round a dot).
 * The HUD font is Valve's "HalfLife2", which is not shipped here; the stack
 * falls back to a heavy rounded sans (tf2-game.css `--hl2g-font`).
 *
 * Portal: the portal gun's crosshair — a left (blue) and right (orange)
 * bracket that fill in when that portal is placed, and fade overlays.
 *
 * Both: closed captions in a box near the bottom centre (HudCloseCaption) that
 * grows upward from the panel's bottom edge, as the engine's caption box does.
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { HudCaption, HudFade, HudHl2, HudPortal } from '@/lib/tf2-game/client/hud-state';
import { useHudContext, usePanelStyle } from '../use-hud';

export function Captions({ captions }: { captions: HudCaption[] }) {
  const { t } = useTranslation('c-tf2-game');
  const { settings, screen } = useHudContext();
  const panel = usePanelStyle('HudCloseCaption');
  if (!settings.captions || !panel || captions.length === 0) return null;
  // A portrait phone is narrower than the 500-unit box: keep a 16px gutter.
  const width = Math.min(Number(panel.width), screen.w - 32);
  const style = { ...panel, width, left: Math.max(16, (screen.w - width) / 2) };
  return (
    <div className="tf2g-panel" style={style}>
      <div className="sp-captions" style={{ left: 0, right: 0, bottom: 0 }} role="log" aria-live="polite" aria-label={t('captions_aria', { defaultValue: 'Captions' })}>
        {captions.map((c) => (
          <p key={c.id} className="sp-caption" data-sfx={c.sfx} style={c.color ? { color: c.color } : undefined}>
            {c.speaker ? <b>{c.speaker}: </b> : null}
            {c.sfx ? `[${c.text}]` : c.text}
          </p>
        ))}
      </div>
    </div>
  );
}

function Hl2Crosshair({ hl2 }: { hl2: HudHl2 }) {
  const health = Math.max(0, Math.min(1, hl2.health / 100));
  const ammo = hl2.clip >= 0 && hl2.clip + hl2.reserve > 0 ? 1 : 0;
  const s = 48;
  const c = s / 2;
  // The quick-info brackets: left = health, right = ammo; each arc empties from the bottom.
  const arc = (side: -1 | 1, f: number) => {
    const r = 14;
    const a0 = Math.PI * 0.7;
    const a1 = Math.PI * 1.3;
    const pt = (a: number) => `${c + side * -Math.cos(a) * r} ${c + Math.sin(a) * -r}`;
    const end = a0 + (a1 - a0) * f;
    return (
      <>
        <path d={`M${pt(a0)} A${r} ${r} 0 0 ${side === -1 ? 0 : 1} ${pt(a1)}`} stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" fill="none" />
        {f > 0 ? <path d={`M${pt(a0)} A${r} ${r} 0 0 ${side === -1 ? 0 : 1} ${pt(end)}`} stroke="currentColor" strokeWidth="2.5" fill="none" /> : null}
      </>
    );
  };
  return (
    <svg className="hl2g-crosshair" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {arc(-1, health)}
      {arc(1, ammo)}
      <circle cx={c} cy={c} r="1.6" fill="currentColor" />
      <circle cx={c - 6} cy={c} r="1" fill="currentColor" />
      <circle cx={c + 6} cy={c} r="1" fill="currentColor" />
      <circle cx={c} cy={c - 6} r="1" fill="currentColor" />
      <circle cx={c} cy={c + 6} r="1" fill="currentColor" />
    </svg>
  );
}

function AuxPower({ hl2 }: { hl2: HudHl2 }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudSuitPower');
  if (!style || hl2.aux >= 1) return null;
  const segments = 10;
  const on = Math.ceil(hl2.aux * segments);
  const uses = [
    hl2.auxSprint ? t('hl2_sprint', { defaultValue: 'Sprint' }) : null,
    hl2.auxFlashlight ? t('hl2_flashlight', { defaultValue: 'Flashlight' }) : null,
    hl2.auxOxygen ? t('hl2_oxygen', { defaultValue: 'Oxygen' }) : null,
  ].filter(Boolean);
  return (
    <div
      className="hl2g-panel hl2g-aux"
      style={style}
      data-low={hl2.aux < 0.25}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hl2.aux * 100)}
      aria-label={t('hl2_aux', { defaultValue: 'Aux power' })}
    >
      <span className="hl2g-label">{t('hl2_aux', { defaultValue: 'Aux power' })}</span>
      <div className="hl2g-aux-bar" aria-hidden="true">
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} data-on={i < on} />
        ))}
      </div>
      {uses.length ? <span className="hl2g-aux-uses">{uses.join(' · ')}</span> : null}
    </div>
  );
}

/** Red arcs toward where damage came from (CHudDamageIndicator), around the centre of the view. */
function DamageArcs({ hl2 }: { hl2: HudHl2 }) {
  const { screen } = useHudContext();
  if (!hl2.damageDirections.length) return null;
  const cx = screen.w / 2;
  const cy = screen.h / 2;
  const r = Math.min(screen.w, screen.h) * 0.36;
  const half = (18 * Math.PI) / 180;
  return (
    <svg className="hl2g-damage" viewBox={`0 0 ${screen.w} ${screen.h}`} aria-hidden="true">
      {hl2.damageDirections.map((d) => {
        // 0° is straight ahead (up on screen); positive angles are to the left, as Source's yaw.
        const a = (-d.angle * Math.PI) / 180 - Math.PI / 2;
        const p0 = `${cx + Math.cos(a - half) * r} ${cy + Math.sin(a - half) * r}`;
        const p1 = `${cx + Math.cos(a + half) * r} ${cy + Math.sin(a + half) * r}`;
        return <path key={d.id} d={`M${p0} A${r} ${r} 0 0 1 ${p1}`} stroke="rgb(255 0 0)" strokeOpacity="0.7" strokeWidth="10" fill="none" />;
      })}
    </svg>
  );
}

export function Hl2Hud({ hl2, alive }: { hl2: HudHl2; alive: boolean }) {
  const { t } = useTranslation('c-tf2-game');
  const health = usePanelStyle('HudHealth');
  const suit = usePanelStyle('HudSuit');
  const ammoPlain = usePanelStyle('HudAmmo');
  const ammoMoved = usePanelStyle('HudAmmoWithSecondary');
  const ammo = hl2.altAmmo >= 0 ? (ammoMoved ?? ammoPlain) : ammoPlain;
  const ammo2 = usePanelStyle('HudAmmoSecondary');
  const history = usePanelStyle('HudHistoryResource');
  if (!hl2.hasSuit) return null;
  return (
    <div className="hl2g-hud">
      {health ? (
        <div className="hl2g-panel" style={health} data-low={hl2.health <= 20} role="status" aria-label={t('hl2_health_aria', { defaultValue: 'Health {{n}}', n: hl2.health })}>
          <span className="hl2g-label">{t('hl2_health', { defaultValue: 'Health' })}</span>
          <span className="hl2g-num" aria-hidden="true">
            {hl2.health}
          </span>
        </div>
      ) : null}
      {suit && hl2.armor > 0 ? (
        <div className="hl2g-panel" style={suit} role="status" aria-label={t('hl2_suit_aria', { defaultValue: 'Suit {{n}}', n: hl2.armor })}>
          <span className="hl2g-label">{t('hl2_suit', { defaultValue: 'Suit' })}</span>
          <span className="hl2g-num" aria-hidden="true">
            {hl2.armor}
          </span>
        </div>
      ) : null}
      <AuxPower hl2={hl2} />
      {ammo && hl2.clip >= 0 ? (
        <div
          className="hl2g-panel"
          style={ammo}
          data-low={hl2.clip === 0}
          role="status"
          aria-label={t('hl2_ammo_aria', { defaultValue: 'Ammo {{clip}}, reserve {{reserve}}', clip: hl2.clip, reserve: hl2.reserve })}
        >
          <span className="hl2g-label">{t('hl2_ammo', { defaultValue: 'Ammo' })}</span>
          <span className="hl2g-num" aria-hidden="true">
            {hl2.clip}
          </span>
          <span className="hl2g-num-small" aria-hidden="true">
            {hl2.reserve}
          </span>
        </div>
      ) : null}
      {ammo2 && hl2.altAmmo >= 0 ? (
        <div className="hl2g-panel" style={ammo2} role="status" aria-label={t('hl2_alt_aria', { defaultValue: 'Alt ammo {{n}}', n: hl2.altAmmo })}>
          <span className="hl2g-label">{t('hl2_alt', { defaultValue: 'Alt' })}</span>
          <span className="hl2g-num" aria-hidden="true">
            {hl2.altAmmo}
          </span>
        </div>
      ) : null}
      {history && hl2.pickups.length ? (
        <ul className="hl2g-pickups" style={history} aria-live="polite">
          {hl2.pickups.map((p) => (
            <li key={p.id} className="hl2g-pickup">
              {p.amount > 1 ? `${p.amount} × ` : ''}
              {p.label}
            </li>
          ))}
        </ul>
      ) : null}
      <DamageArcs hl2={hl2} />
      {alive ? <Hl2Crosshair hl2={hl2} /> : null}
    </div>
  );
}

/** The portal gun's crosshair: blue bracket left, orange right, filled when that portal exists. */
export function PortalCrosshair({ portal }: { portal: HudPortal }) {
  const s = 44;
  const c = s / 2;
  const r = 13;
  const bracket = (side: -1 | 1, color: string, placed: boolean, enabled: boolean) => {
    if (!enabled) return null;
    const x = c + side * 4;
    const d = `M${x} ${c - r} A${r} ${r} 0 0 ${side === -1 ? 0 : 1} ${x} ${c + r}`;
    return (
      <>
        <path d={d} stroke="rgb(0 0 0 / 0.45)" strokeWidth="5" fill="none" />
        <path d={d} stroke={color} strokeWidth="2.5" fill={placed ? color : 'none'} fillOpacity={placed ? 0.85 : 0} />
      </>
    );
  };
  return (
    <svg className="ptl-crosshair" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden="true">
      {bracket(-1, 'var(--ptl-blue)', portal.bluePlaced, portal.canFireBlue)}
      {bracket(1, 'var(--ptl-orange)', portal.orangePlaced, portal.canFireOrange)}
      <circle cx={c} cy={c} r="1.4" fill="rgb(255 255 255)" />
    </svg>
  );
}

export function PortalHud({ portal, fade }: { portal: HudPortal; fade: HudFade | null }) {
  const { t } = useTranslation('c-tf2-game');
  const { settings } = useHudContext();
  const placed = [
    portal.bluePlaced ? t('ptl_blue_placed', { defaultValue: 'Blue portal placed' }) : null,
    portal.orangePlaced ? t('ptl_orange_placed', { defaultValue: 'Orange portal placed' }) : null,
  ].filter(Boolean);
  return (
    <div className="ptl-hud">
      {portal.hasGun ? <PortalCrosshair portal={portal} /> : null}
      <span className="tf2g-sr" role="status">
        {placed.join(', ')}
      </span>
      {portal.health < 100 && portal.health > 0 ? (
        <div className="ptl-damage" style={{ opacity: settings.reducedFlashing ? 0.35 : (100 - portal.health) / 100 }} aria-hidden="true" />
      ) : null}
      {fade ? (
        <div
          className="ptl-fade"
          style={{ background: fade.color, opacity: settings.reducedFlashing ? Math.min(fade.alpha, 0.6) : fade.alpha }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
