/**
 * TF2's player status, bottom left: the class portrait on its team-coloured
 * plate (HudPlayerClass) and the health cross (HudPlayerHealth) — a dark cross
 * filled from the bottom with the health fraction, the number on it, the
 * overheal cross pulsing behind when buffed, and the background flashing red
 * below 49% (HealthDeathWarning). Condition chips sit beside it (fire, bleed,
 * Jarate, Mad Milk, marked for death, über, crits).
 */
'use client';

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { isLowHealth, type HudLocalPlayer } from '@/lib/tf2-game/client/hud-state';
import { classPortraitPath, useHudTexture } from '../hud-textures';
import { useClassNames } from '../strings';
import { useHudContext, usePanelStyle } from '../use-hud';

/** The cross in a 128-unit box (the shape of materials/hud/health_bg). */
export const CROSS_PATH = 'M43 6h42v37h37v42H85v37H43V85H6V43h37z';

export function HealthCross({
  fraction,
  className,
  overheal = false,
}: {
  fraction: number;
  className?: string;
  overheal?: boolean;
}) {
  const clip = useId();
  const f = Math.max(0, Math.min(1, fraction));
  const top = 6 + (1 - f) * 116;
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden="true">
      {overheal ? <path className="tf2g-cross-over" d={CROSS_PATH} /> : null}
      <path className="tf2g-cross-bg" d={CROSS_PATH} transform="translate(-4 -4) scale(1.0625)" />
      <clipPath id={clip}>
        <rect x="0" y={top} width="128" height={128 - top} />
      </clipPath>
      <path className="tf2g-cross-fill" d={CROSS_PATH} clipPath={`url(#${clip})`} />
    </svg>
  );
}

export default function HealthPanel({ local }: { local: HudLocalPlayer }) {
  const { t } = useTranslation('c-tf2-game');
  const { settings } = useHudContext();
  const classNames = useClassNames();
  const healthStyle = usePanelStyle('HudPlayerHealth');
  const classStyle = usePanelStyle('HudPlayerClass');
  const portrait = useHudTexture(classPortraitPath(local.cls, local.team));
  const c = local.conditions;
  const overheal = local.alive && local.health > local.maxHealth;
  const low = local.alive && isLowHealth(local.health, local.maxHealth);
  const fraction = local.health / Math.max(1, local.maxHealth);

  const chips: Array<{ kind: string; label: string }> = [];
  if (c.ubered) chips.push({ kind: 'ubered', label: t('cond_uber', { defaultValue: 'Über' }) });
  if (c.critBoosted) chips.push({ kind: 'crit', label: t('cond_crits', { defaultValue: 'Crits' }) });
  if (c.burning) chips.push({ kind: 'burning', label: t('cond_burning', { defaultValue: 'Fire' }) });
  if (c.bleeding) chips.push({ kind: 'bleeding', label: t('cond_bleeding', { defaultValue: 'Bleed' }) });
  if (c.jarated) chips.push({ kind: 'jarate', label: t('cond_jarate', { defaultValue: 'Jarate' }) });
  if (c.milked) chips.push({ kind: 'milk', label: t('cond_milk', { defaultValue: 'Milk' }) });
  if (c.markedForDeath) chips.push({ kind: 'marked', label: t('cond_marked', { defaultValue: 'Marked' }) });

  return (
    <>
      {classStyle ? (
        <div className={`tf2g-panel tf2g-team-${local.team}`} style={classStyle} aria-hidden="true">
          <div className="tf2g-class-bg" />
          {portrait ? (
            <img className="tf2g-class-img" src={portrait} alt="" draggable={false} />
          ) : (
            <div className="tf2g-class-fallback tf2g-build">{classNames[local.cls] ?? ''}</div>
          )}
        </div>
      ) : null}
      {healthStyle ? (
        <div
          className={`tf2g-panel tf2g-health tf2g-team-${local.team}`}
          style={healthStyle}
          data-overheal={overheal}
          data-low={low}
          data-dead={!local.alive}
          data-calm={settings.reducedFlashing}
          role="status"
          aria-label={t('health_aria', {
            defaultValue: 'Health {{health}} of {{max}}',
            health: local.health,
            max: local.maxHealth,
          })}
        >
          <HealthCross className="tf2g-cross" fraction={fraction} overheal={overheal} />
          {local.alive && local.health < local.maxHealth ? (
            <div className="tf2g-health-max tf2g-shadow" aria-hidden="true">
              {local.maxHealth}
            </div>
          ) : null}
          <div className="tf2g-health-value" aria-hidden="true">
            {local.alive ? local.health : ''}
          </div>
          {chips.length ? (
            <div className="tf2g-status-icons">
              {chips.map((chip) => (
                <span key={chip.kind} className="tf2g-status-icon tf2g-build" data-kind={chip.kind}>
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
