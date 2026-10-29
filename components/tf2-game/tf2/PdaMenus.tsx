/**
 * The PDA menus, open while the PDA is the active weapon: the Engineer's
 * construction PDA (1 Sentry Gun, 2 Dispenser, 3 Teleporter Entrance,
 * 4 Teleporter Exit — with the metal each costs and "Already built"), his
 * destruction PDA (the same four, for demolition), and the Spy's disguise kit
 * (nine classes in menu order, `-` toggles which team's uniform).
 */
'use client';

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CLASS_MENU_ORDER } from '@/lib/tf2-game/core/constants';
import { OBJECT_INFO, OBJECT_TYPE } from '@/lib/tf2-game/data/buildings';
import type { HudEngineer } from '@/lib/tf2-game/client/hud-state';
import { classMenuPath, useHudTexture } from '../hud-textures';
import { useMenuNav } from '../menu-nav';
import { useBuildingNames, useClassNames, useTeamNames } from '../strings';

/** The four buildable slots in menu order: [kind, objectType, objectMode, cost]. */
export const BUILD_SLOTS = [
  { kind: 'sentry', objectType: OBJECT_TYPE.OBJ_SENTRYGUN, objectMode: 0, cost: OBJECT_INFO.OBJ_SENTRYGUN.cost },
  { kind: 'dispenser', objectType: OBJECT_TYPE.OBJ_DISPENSER, objectMode: 0, cost: OBJECT_INFO.OBJ_DISPENSER.cost },
  { kind: 'entrance', objectType: OBJECT_TYPE.OBJ_TELEPORTER, objectMode: 0, cost: OBJECT_INFO.OBJ_TELEPORTER.cost },
  { kind: 'exit', objectType: OBJECT_TYPE.OBJ_TELEPORTER, objectMode: 1, cost: OBJECT_INFO.OBJ_TELEPORTER.cost },
] as const;

const BLUEPRINTS: Record<(typeof BUILD_SLOTS)[number]['kind'], string> = {
  sentry: 'materials/hud/eng_build_sentry_blueprint',
  dispenser: 'materials/hud/eng_build_dispenser_blueprint',
  entrance: 'materials/hud/eng_build_tele_entrance_blueprint',
  exit: 'materials/hud/eng_build_tele_exit_blueprint',
};

function BuildCard({
  slot,
  index,
  engineer,
  destroy,
  onPick,
}: {
  slot: (typeof BUILD_SLOTS)[number];
  index: number;
  engineer: HudEngineer;
  destroy: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const names = useBuildingNames();
  const img = useHudTexture(BLUEPRINTS[slot.kind]);
  const built = engineer[slot.kind].exists;
  const disabled = destroy ? !built : built || engineer.metal < slot.cost;
  const note = destroy
    ? built
      ? null
      : t('pda_not_built', { defaultValue: 'Not built' })
    : built
      ? t('pda_built', { defaultValue: 'Already built' })
      : engineer.metal < slot.cost
        ? t('pda_need_metal', { defaultValue: 'Need more metal' })
        : null;
  return (
    <button
      type="button"
      className="tf2g-pda-item"
      data-menu-item
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onPick();
      }}
    >
      <span className="tf2g-card-key">{index + 1}</span>
      {img ? <img src={img} alt="" draggable={false} /> : <span className="tf2g-class-ph" aria-hidden="true" />}
      <span>{names[slot.kind]}</span>
      {destroy ? null : <span className="tf2g-pda-cost">{t('pda_cost', { defaultValue: '{{n}} metal', n: slot.cost })}</span>}
      {note ? <span className="tf2g-pda-note">{note}</span> : null}
    </button>
  );
}

export function BuildMenu({
  engineer,
  team,
  destroy,
  onPick,
  onClose,
}: {
  engineer: HudEngineer;
  team: number;
  destroy: boolean;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, true, onClose, { grid: true, focusFirst: false });
  return (
    <div
      ref={ref}
      className={`tf2g-pda tf2g-team-${team}`}
      role="group"
      aria-label={destroy ? t('pda_destroy', { defaultValue: 'Destroy' }) : t('pda_build', { defaultValue: 'Build' })}
    >
      <div className="tf2g-pda-row">
        {BUILD_SLOTS.map((slot, i) => (
          <BuildCard key={slot.kind} slot={slot} index={i} engineer={engineer} destroy={destroy} onPick={() => onPick(i)} />
        ))}
      </div>
      <div className="tf2g-pda-foot tf2g-shadow">
        {destroy
          ? t('pda_destroy_hint', { defaultValue: 'Press 1–4 to demolish a building' })
          : t('pda_build_hint', { defaultValue: 'Metal: {{metal}} · Press 1–4 to build', metal: engineer.metal })}
      </div>
    </div>
  );
}

function DisguiseCard({ cls, team, index, onPick }: { cls: number; team: number; index: number; onPick: () => void }) {
  const classNames = useClassNames();
  const img = useHudTexture(classMenuPath(cls, team));
  return (
    <button type="button" className={`tf2g-pda-item tf2g-team-${team}`} data-menu-item onClick={onPick}>
      <span className="tf2g-card-key">{index + 1}</span>
      {img ? (
        <img src={img} alt="" draggable={false} />
      ) : (
        <span className="tf2g-class-ph" aria-hidden="true">
          {(classNames[cls] ?? '').slice(0, 1)}
        </span>
      )}
      <span>{classNames[cls]}</span>
    </button>
  );
}

export function DisguiseMenu({
  disguiseTeam,
  onPick,
  onToggleTeam,
  onClose,
}: {
  /** The team whose uniform the menu offers (the enemy by default). */
  disguiseTeam: number;
  onPick: (cls: number) => void;
  onToggleTeam: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, true, onClose, { grid: true, focusFirst: false });
  return (
    <div ref={ref} className={`tf2g-pda tf2g-team-${disguiseTeam}`} role="group" aria-label={t('pda_disguise', { defaultValue: 'Disguise' })}>
      <div className="tf2g-pda-row">
        {CLASS_MENU_ORDER.map((cls, i) => (
          <DisguiseCard key={cls} cls={cls} team={disguiseTeam} index={i} onPick={() => onPick(cls)} />
        ))}
      </div>
      <button type="button" className="tf2g-pda-foot tf2g-menu-item tf2g-shadow" data-menu-item onClick={onToggleTeam}>
        {t('pda_disguise_team', {
          defaultValue: 'Disguising as {{team}} — press - to switch team',
          team: teams[disguiseTeam],
        })}
      </button>
    </div>
  );
}
