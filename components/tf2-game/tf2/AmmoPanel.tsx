/**
 * Bottom right: the ammo panel (HudWeaponAmmo — big clip, smaller reserve, or
 * one number for weapons that draw straight from reserve), the Medic's
 * ÜberCharge meter (HudMedicCharge), the item meter slot (HudItemEffectMeter /
 * HudDemomanPipes: cloak, stickybombs, minigun spin, the Engineer's metal) and
 * the stickybomb charge bar under the ammo (HudDemomanCharge).
 */
'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { HudLocalPlayer } from '@/lib/tf2-game/client/hud-state';
import { usePanelStyle } from '../use-hud';

function Bar({ value, tone }: { value: number; tone?: 'team' | 'warn' }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="tf2g-bar" data-tone={tone}>
      <span style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function AmmoPanel({ local }: { local: HudLocalPlayer }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudWeaponAmmo');
  const a = local.ammo;
  if (!style || !local.alive || a.kind === 'none') return null;
  const low = a.kind === 'clip' ? a.clip === 0 : a.reserve <= Math.ceil(a.maxReserve * 0.2);
  const label =
    a.kind === 'clip'
      ? t('ammo_aria', { defaultValue: 'Ammo {{clip}} in clip, {{reserve}} in reserve', clip: a.clip, reserve: a.reserve })
      : t('ammo_aria_noclip', { defaultValue: 'Ammo {{reserve}}', reserve: a.reserve });
  return (
    <div className={`tf2g-panel tf2g-ammo tf2g-team-${local.team}`} style={style} data-low={low} role="status" aria-label={label}>
      <div className="tf2g-ammo-bg" />
      {a.kind === 'clip' ? (
        <>
          <div className="tf2g-ammo-clip tf2g-shadow" aria-hidden="true">
            {a.clip}
          </div>
          <div className="tf2g-ammo-reserve tf2g-shadow" aria-hidden="true">
            {a.reserve}
          </div>
        </>
      ) : (
        <div className="tf2g-ammo-noclip tf2g-shadow" aria-hidden="true">
          {a.reserve}
        </div>
      )}
    </div>
  );
}

export function MedicCharge({ local }: { local: HudLocalPlayer }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudMedicCharge');
  const uber = local.meters.uber;
  if (!style || uber === null || !local.alive) return null;
  const pct = Math.floor(uber * 100);
  return (
    <div className={`tf2g-panel tf2g-team-${local.team}`} style={style}>
      <div className="tf2g-meter-box tf2g-uber" data-full={uber >= 1} role="status">
        <div className="tf2g-meter-label tf2g-shadow">
          {t('ubercharge', { defaultValue: 'ÜberCharge: {{pct}}%', pct })}
        </div>
        <Bar value={uber} tone={local.meters.uberDeployed ? 'team' : undefined} />
      </div>
    </div>
  );
}

/** The item meter slot: one of cloak, stickybombs, minigun spin, metal (by class). */
export function ItemEffectMeter({ local }: { local: HudLocalPlayer }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('HudItemEffectMeter');
  const m = local.meters;
  if (!style || !local.alive) return null;
  let body: ReactNode = null;
  if (m.cloak !== null) {
    body = (
      <>
        <div className="tf2g-meter-label tf2g-shadow">{t('cloak', { defaultValue: 'Cloak' })}</div>
        <Bar value={m.cloak} tone={m.cloak < 0.15 ? 'warn' : undefined} />
      </>
    );
  } else if (m.stickyCount !== null) {
    body = (
      <div className="tf2g-pipes">
        <span className="tf2g-pipes-count tf2g-shadow">{m.stickyCount}</span>
        <span className="tf2g-meter-label tf2g-shadow">
          {t('stickies', { defaultValue: 'Stickies' })}
        </span>
      </div>
    );
  } else if (local.engineer) {
    body = (
      <>
        <div className="tf2g-meter-label tf2g-shadow">
          {t('metal', { defaultValue: 'Metal: {{metal}}', metal: local.engineer.metal })}
        </div>
        <Bar value={local.engineer.metal / Math.max(1, local.engineer.maxMetal)} />
      </>
    );
  } else if (m.minigunSpin !== null && m.minigunSpin > 0) {
    body = (
      <>
        <div className="tf2g-meter-label tf2g-shadow">{t('minigun_spin', { defaultValue: 'Spin' })}</div>
        <Bar value={m.minigunSpin} />
      </>
    );
  }
  if (!body) return null;
  return (
    <div className={`tf2g-panel tf2g-team-${local.team}`} style={style}>
      <div className="tf2g-meter-box tf2g-effect" role="status">
        {body}
      </div>
    </div>
  );
}

/** The stickybomb launcher's charge, a thin bar over the bottom of the ammo panel while held. */
export function StickyCharge({ local }: { local: HudLocalPlayer }) {
  const style = usePanelStyle('HudDemomanCharge');
  const c = local.meters.stickyCharge;
  if (!style || c === null || c <= 0 || !local.alive) return null;
  return (
    <div className="tf2g-panel" style={style} aria-hidden="true">
      <Bar value={c} />
    </div>
  );
}
