/**
 * The join menus: team select (BLU, RED, Auto-assign, Spectate — keys 1–4)
 * and class select (nine classes in the game's menu order, grouped Offense /
 * Defense / Support, team-coloured, keys 1–9, 0 for random, with how many of
 * your team play each class). Both are real buttons: mouse, touch, keyboard
 * (Tab / arrows / Enter) and gamepad (d-pad, A, B) all work.
 */
'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { CLASS_MENU_ORDER, CLASS_NAMES } from '@/lib/tf2-game/core/constants';
import type { ClassChoice, TeamChoice } from '@/lib/tf2-game/net/events';
import type { HudScoreRow } from '@/lib/tf2-game/client/hud-state';
import { classMenuPath, useHudTexture } from '../hud-textures';
import { useMenuNav } from '../menu-nav';
import { useClassNames, useTeamNames } from '../strings';

export const TEAM_MENU_KEYS: readonly TeamChoice[] = ['blue', 'red', 'auto', 'spectator'];

export function TeamMenu({
  rows,
  current,
  onPick,
  onClose,
}: {
  rows: HudScoreRow[];
  current: number;
  onPick: (team: TeamChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const teams = useTeamNames();
  const ref = useRef<HTMLDivElement>(null);
  useMenuNav(ref, true, onClose, { grid: true });
  const count = (team: number) => rows.filter((r) => r.team === team).length;
  const card = (choice: TeamChoice, key: number, team: number, name: string, small = false) => (
    <button
      type="button"
      className={`tf2g-team-card tf2g-team-${team}`}
      data-small={small}
      data-menu-item
      data-current={current === team}
      onClick={() => onPick(choice)}
    >
      <span className="tf2g-card-key">{key}</span>
      <span className="tf2g-team-card-name tf2g-shadow">{name}</span>
      {team >= 2 ? (
        <span className="tf2g-team-card-count">{t('team_count', { defaultValue: '{{n}} players', n: count(team) })}</span>
      ) : null}
    </button>
  );
  return (
    <div ref={ref} className="tf2g-select" role="region" aria-label={t('team_menu', { defaultValue: 'Choose a team' })}>
      <h2 className="tf2g-select-title tf2g-shadow">{t('team_menu', { defaultValue: 'Choose a team' })}</h2>
      <div className="tf2g-teams">
        {card('blue', 1, 3, teams[3])}
        {card('red', 2, 2, teams[2])}
      </div>
      <div className="tf2g-teams">
        {card('auto', 3, 0, t('team_auto', { defaultValue: 'Auto-assign' }), true)}
        {card('spectator', 4, 1, teams[1], true)}
      </div>
      <p className="tf2g-select-hint">{t('team_menu_hint', { defaultValue: 'Press 1–4 to choose, Esc to close' })}</p>
      <SelectClose onClose={onClose} />
    </div>
  );
}

/** Class menu order (scout, soldier, pyro | demoman, heavy, engineer | medic, sniper, spy) grouped by role. */
const GROUPS: Array<{ key: 'offense' | 'defense' | 'support'; classes: number[] }> = [
  { key: 'offense', classes: CLASS_MENU_ORDER.slice(0, 3) as number[] },
  { key: 'defense', classes: CLASS_MENU_ORDER.slice(3, 6) as number[] },
  { key: 'support', classes: CLASS_MENU_ORDER.slice(6, 9) as number[] },
];

function ClassCard({
  cls,
  team,
  count,
  hotkey,
  current,
  onPick,
  onFocus,
}: {
  cls: number;
  team: number;
  count: number;
  hotkey: number;
  current: boolean;
  onPick: () => void;
  onFocus: () => void;
}) {
  const classNames = useClassNames();
  const img = useHudTexture(classMenuPath(cls, team));
  return (
    <button
      type="button"
      className={`tf2g-class-card tf2g-team-${team}`}
      data-menu-item
      data-current={current}
      onClick={onPick}
      onFocus={onFocus}
      onMouseEnter={onFocus}
      aria-label={`${classNames[cls]}${count ? ` (${count})` : ''}`}
    >
      <span className="tf2g-card-key" aria-hidden="true">
        {hotkey}
      </span>
      {count ? (
        <span className="tf2g-class-count" aria-hidden="true">
          {count}
        </span>
      ) : null}
      {img ? (
        <img src={img} alt="" draggable={false} />
      ) : (
        <span className="tf2g-class-ph" aria-hidden="true">
          {(classNames[cls] ?? '?').slice(0, 1)}
        </span>
      )}
      <span className="tf2g-class-card-name" aria-hidden="true">
        {classNames[cls]}
      </span>
    </button>
  );
}

export function ClassMenu({
  team,
  rows,
  current,
  onPick,
  onClose,
}: {
  team: number;
  rows: HudScoreRow[];
  current: number;
  onPick: (cls: ClassChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const classNames = useClassNames();
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(current);
  useMenuNav(ref, true, onClose, { grid: true });
  const pick = useCallback((cls: number) => onPick((cls ? CLASS_NAMES[cls] : 'random') as ClassChoice), [onPick]);
  const count = (cls: number) => rows.filter((r) => r.team === team && r.cls === cls).length;
  const groupName = {
    offense: t('class_group_offense', { defaultValue: 'Offense' }),
    defense: t('class_group_defense', { defaultValue: 'Defense' }),
    support: t('class_group_support', { defaultValue: 'Support' }),
  };
  return (
    <div
      ref={ref}
      className={`tf2g-select tf2g-team-${team}`}
      role="region"
      aria-label={t('class_menu', { defaultValue: 'Choose a class' })}
    >
      <h2 className="tf2g-select-title tf2g-shadow">{t('class_menu', { defaultValue: 'Choose a class' })}</h2>
      <div className="tf2g-classes">
        {GROUPS.map((g) => (
          <div key={g.key} className="tf2g-class-group">
            <span className="tf2g-class-group-name">{groupName[g.key]}</span>
            <div className="tf2g-class-group-row">
              {g.classes.map((cls) => (
                <ClassCard
                  key={cls}
                  cls={cls}
                  team={team}
                  count={count(cls)}
                  hotkey={CLASS_MENU_ORDER.indexOf(cls as (typeof CLASS_MENU_ORDER)[number]) + 1}
                  current={cls === current}
                  onPick={() => pick(cls)}
                  onFocus={() => setFocused(cls)}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="tf2g-class-group">
          <span className="tf2g-class-group-name">&nbsp;</span>
          <div className="tf2g-class-group-row">
            <ClassCard cls={0} team={team} count={0} hotkey={0} current={false} onPick={() => pick(0)} onFocus={() => setFocused(0)} />
          </div>
        </div>
      </div>
      <div className="tf2g-class-focus tf2g-shadow" aria-hidden="true">
        {classNames[focused] ?? ''}
      </div>
      <p className="tf2g-select-hint">{t('class_menu_hint', { defaultValue: 'Press 1–9 to choose, 0 for random, Esc to close' })}</p>
      <SelectClose onClose={onClose} />
    </div>
  );
}

/** Touch only (CSS): the menus cover the touch controls, and a phone has no Esc key to close them. */
function SelectClose({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('c-tf2-game');
  return (
    <button type="button" className="tf2g-select-close" aria-label={t('menu_close', { defaultValue: 'Close' })} onClick={onClose}>
      <X aria-hidden="true" />
    </button>
  );
}

/** The class picked by a number key in the class menu (1–9 → menu order, 0 → random). */
export function classForMenuKey(key: number): ClassChoice | null {
  if (key === 0) return 'random';
  const cls = CLASS_MENU_ORDER[key - 1];
  return cls ? (CLASS_NAMES[cls] as ClassChoice) : null;
}
