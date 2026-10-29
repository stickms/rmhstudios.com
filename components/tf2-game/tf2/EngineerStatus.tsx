/**
 * The Engineer's building status, top left (BuildingStatus_Engineer): one
 * team-coloured panel per building with its icon, a health bar, level,
 * upgrade progress, sentry ammo and kills, dispenser metal, teleporter
 * recharge — or "Not built" — and an alert edge while sapped or damaged.
 */
'use client';

import { useTranslation } from 'react-i18next';
import type { HudBuilding, HudEngineer } from '@/lib/tf2-game/client/hud-state';
import { useHudTexture } from '../hud-textures';
import { useBuildingNames } from '../strings';
import { usePanelStyle } from '../use-hud';

const ICONS: Record<HudBuilding['kind'], (level: number) => string> = {
  sentry: (level) => `materials/hud/hud_obj_status_sentry_${Math.min(3, Math.max(1, level))}`,
  dispenser: () => 'materials/hud/hud_obj_status_dispenser',
  entrance: () => 'materials/hud/hud_obj_status_tele_entrance',
  exit: () => 'materials/hud/hud_obj_status_tele_exit',
};

function Bar({ value }: { value: number }) {
  return (
    <div className="tf2g-bar">
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

function BuildingRow({ b, team }: { b: HudBuilding; team: number }) {
  const { t } = useTranslation('c-tf2-game');
  const names = useBuildingNames();
  const icon = useHudTexture(ICONS[b.kind](b.level));
  const hp = b.maxHealth > 0 ? b.health / b.maxHealth : 0;
  const alert = b.exists && (b.sapped || hp < 0.5);
  return (
    <li className={`tf2g-building tf2g-team-${team}`} data-exists={b.exists} data-alert={alert}>
      {icon ? (
        <img className="tf2g-building-icon" src={icon} alt="" draggable={false} />
      ) : (
        <span className="tf2g-building-icon" aria-hidden="true" />
      )}
      {b.exists ? (
        <>
          <div
            className="tf2g-building-hp"
            data-low={hp < 0.5}
            role="meter"
            aria-valuemin={0}
            aria-valuemax={b.maxHealth}
            aria-valuenow={b.health}
            aria-label={t('building_health', { defaultValue: '{{name}} health', name: names[b.kind] })}
          >
            <span style={{ height: `${hp * 100}%` }} />
          </div>
          <div className="tf2g-building-body">
            <div className="tf2g-building-row">
              <span className="tf2g-building-name">{names[b.kind]}</span>
              <span>{t('building_level', { defaultValue: 'Lvl {{n}}', n: b.level })}</span>
            </div>
            {b.building ? (
              <div className="tf2g-building-row">
                <span>{t('building_building', { defaultValue: 'Building…' })}</span>
                <Bar value={b.buildProgress} />
              </div>
            ) : b.sapped ? (
              <div className="tf2g-building-row">
                <span className="tf2g-pda-note">{t('building_sapped', { defaultValue: 'Sapped!' })}</span>
              </div>
            ) : (
              <>
                {b.kind === 'sentry' ? (
                  <div className="tf2g-building-row">
                    <span>{t('building_shells', { defaultValue: 'Ammo' })}</span>
                    <Bar value={b.maxShells ? b.shells / b.maxShells : 0} />
                    <span>{t('building_kills', { defaultValue: 'Kills: {{n}}', n: b.kills })}</span>
                  </div>
                ) : null}
                {b.kind === 'sentry' && b.maxRockets > 0 ? (
                  <div className="tf2g-building-row">
                    <span>{t('building_rockets', { defaultValue: 'Rockets' })}</span>
                    <Bar value={b.rockets / b.maxRockets} />
                  </div>
                ) : null}
                {b.kind === 'dispenser' ? (
                  <div className="tf2g-building-row">
                    <span>{t('building_metal', { defaultValue: 'Metal' })}</span>
                    <Bar value={b.metal / 400} />
                  </div>
                ) : null}
                {b.kind === 'entrance' || b.kind === 'exit' ? (
                  <div className="tf2g-building-row">
                    <span>
                      {!b.linked
                        ? t('building_unlinked', { defaultValue: 'No matching end' })
                        : b.ready
                          ? t('building_ready', { defaultValue: 'Ready' })
                          : t('building_charging', { defaultValue: 'Charging' })}
                    </span>
                    {b.linked && !b.ready ? <Bar value={b.charge} /> : null}
                  </div>
                ) : null}
                {b.level < 3 && b.upgradeMetalRequired > 0 ? (
                  <div className="tf2g-building-row">
                    <span>{t('building_upgrade', { defaultValue: 'Upgrade' })}</span>
                    <Bar value={b.upgradeMetal / b.upgradeMetalRequired} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="tf2g-building-body">
          <span className="tf2g-building-name">{names[b.kind]}</span>
          <span>{t('building_not_built', { defaultValue: 'Not built' })}</span>
        </div>
      )}
    </li>
  );
}

export default function EngineerStatus({ engineer, team }: { engineer: HudEngineer; team: number }) {
  const { t } = useTranslation('c-tf2-game');
  const style = usePanelStyle('BuildingStatus_Engineer');
  if (!style) return null;
  return (
    <div className="tf2g-panel" style={style}>
      <ul className="tf2g-buildings" aria-label={t('buildings_aria', { defaultValue: 'Your buildings' })}>
        <BuildingRow b={engineer.sentry} team={team} />
        <BuildingRow b={engineer.dispenser} team={team} />
        <BuildingRow b={engineer.entrance} team={team} />
        <BuildingRow b={engineer.exit} team={team} />
      </ul>
    </div>
  );
}
