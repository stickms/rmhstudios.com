/**
 * What the game would show for a given class, weapon and situation.
 *
 * A HUD file declares every panel it can ever draw; the game decides which are
 * visible at any moment (the Medic charge meter only for a Medic holding a
 * medigun, the Vaccinator's four resist bars instead of one, the Engineer's
 * building panels, the Spy's disguise panel, transient alerts…). The preview
 * mirrors that so each weapon HUD can be visualised from the test panel
 * instead of every panel overlapping at once.
 */

import { type TestState, type Tf2Class, TF2_CLASSES } from './fixtures';

export interface WeaponDef {
  id: string;
  classId: Tf2Class | 'any';
  label: string;
  /** Basename of the `huditemeffectmeter_*` (or other) file that shows this weapon's meter. */
  meter?: string;
}

export const WEAPONS: readonly WeaponDef[] = [
  { id: 'scattergun', classId: 'scout', label: 'Scattergun' },
  { id: 'bonk', classId: 'scout', label: 'Bonk! Atomic Punch', meter: 'huditemeffectmeter_scout' },
  {
    id: 'sodapopper',
    classId: 'scout',
    label: 'Soda Popper (Hype)',
    meter: 'huditemeffectmeter_sodapopper',
  },
  {
    id: 'cleaver',
    classId: 'scout',
    label: 'Flying Guillotine',
    meter: 'huditemeffectmeter_cleaver',
  },
  { id: 'rocket-launcher', classId: 'soldier', label: 'Rocket Launcher' },
  {
    id: 'buff-banner',
    classId: 'soldier',
    label: 'Buff Banner (Rage)',
    meter: 'huditemeffectmeter',
  },
  { id: 'flamethrower', classId: 'pyro', label: 'Flamethrower' },
  { id: 'thermal-thruster', classId: 'pyro', label: 'Thermal Thruster', meter: 'hudrocketpack' },
  { id: 'gas-passer', classId: 'pyro', label: 'Gas Passer', meter: 'huditemeffectmeter_pyro' },
  { id: 'phlog', classId: 'pyro', label: 'Phlogistinator (Mmmph)', meter: 'huditemeffectmeter' },
  { id: 'raygun', classId: 'pyro', label: 'Righteous Bison', meter: 'huditemeffectmeter_raygun' },
  { id: 'stickies', classId: 'demoman', label: 'Stickybomb Launcher', meter: 'huddemomanpipes' },
  { id: 'shield', classId: 'demoman', label: 'Chargin’ Targe (Charge)', meter: 'huddemomancharge' },
  {
    id: 'eyelander',
    classId: 'demoman',
    label: 'Eyelander (Heads)',
    meter: 'huditemeffectmeter_demoman',
  },
  { id: 'minigun', classId: 'heavy', label: 'Minigun' },
  { id: 'sandvich', classId: 'heavy', label: 'Sandvich', meter: 'huditemeffectmeter_heavy' },
  { id: 'shotgun', classId: 'engineer', label: 'Shotgun / Wrench' },
  { id: 'pomson', classId: 'engineer', label: 'Pomson 6000', meter: 'huditemeffectmeter_pomson' },
  {
    id: 'eureka',
    classId: 'engineer',
    label: 'Eureka Effect',
    meter: 'huditemeffectmeter_engineer',
  },
  { id: 'medigun', classId: 'medic', label: 'Medi Gun (Über)' },
  { id: 'kritzkrieg', classId: 'medic', label: 'Kritzkrieg' },
  { id: 'quickfix', classId: 'medic', label: 'Quick-Fix (Über)' },
  { id: 'vaccinator', classId: 'medic', label: 'Vaccinator (4 charges)' },
  {
    id: 'sniper-rifle',
    classId: 'sniper',
    label: 'Sniper Rifle',
    meter: 'huditemeffectmeter_sniperfocus',
  },
  { id: 'huntsman', classId: 'sniper', label: 'Huntsman (Bow charge)', meter: 'hudbowcharge' },
  { id: 'jarate', classId: 'sniper', label: 'Jarate', meter: 'huditemeffectmeter_sniper' },
  { id: 'revolver', classId: 'spy', label: 'Revolver' },
  {
    id: 'spy-knife',
    classId: 'spy',
    label: 'Conniver’s Kunai',
    meter: 'huditemeffectmeter_spyknife',
  },
  { id: 'cloak', classId: 'spy', label: 'Invis Watch / Cloak', meter: 'huditemeffectmeter_spy' },
  { id: 'sapper', classId: 'spy', label: 'Sapper', meter: 'huditemeffectmeter_sapper' },
  {
    id: 'killstreak',
    classId: 'any',
    label: 'Killstreak counter',
    meter: 'huditemeffectmeter_killstreak',
  },
];

export const DEFAULT_WEAPON: Record<Tf2Class, string> = {
  scout: 'scattergun',
  soldier: 'rocket-launcher',
  pyro: 'flamethrower',
  demoman: 'stickies',
  heavy: 'minigun',
  engineer: 'shotgun',
  medic: 'medigun',
  sniper: 'sniper-rifle',
  spy: 'revolver',
};

export function weaponsFor(c: Tf2Class): WeaponDef[] {
  return WEAPONS.filter((w) => w.classId === c || w.classId === 'any');
}

/** Transient on-screen events the test panel can fire. */
export const EVENTS = [
  { id: 'damage', label: 'Damage numbers', files: ['huddamageaccount', 'hudhealthaccount'] },
  { id: 'killstreak', label: 'Killstreak notice', files: ['hudkillstreaknotice'] },
  { id: 'alert', label: 'Alert banner', files: ['hudalert'] },
  { id: 'targetid', label: 'Target ID', files: ['targetid'] },
  { id: 'teamswitch', label: 'Team switch', files: ['hudteamswitch'] },
  { id: 'stalemate', label: 'Stalemate', files: ['hudstalemate'] },
] as const;

/** Situations that switch single elements on inside an always-present file. */
export const SITUATIONS = [{ id: 'flag', label: 'Carrying the intelligence' }] as const;

const baseOf = (file: string): string =>
  file
    .slice(file.lastIndexOf('/') + 1)
    .replace(/\.res$/i, '')
    .toLowerCase();

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function currentWeapon(s: TestState): WeaponDef | undefined {
  const id = s.weapon && s.weapon !== 'auto' ? s.weapon : DEFAULT_WEAPON[s.playerClass];
  return WEAPONS.find((w) => w.id === id);
}

/**
 * Whether a panel is on screen in this situation: `true`/`false` to force it, `undefined` to leave it
 * to the file's own `visible`. `file` is the panel file, `name` the panel's name in it.
 */
export function gateFor(s: TestState): (file: string, name: string) => boolean | undefined {
  const weapon = currentWeapon(s);
  const meter = weapon?.meter;
  const events = new Set(s.events ?? []);
  const cls = s.playerClass;
  const vaccinator = weapon?.id === 'vaccinator';
  const pipes = s.pipes ?? 4;
  const sentry = s.sentryLevel ?? 2;

  return (file, rawName) => {
    const base = baseOf(file);
    const n = rawName.toLowerCase();

    // Transient events.
    for (const e of EVENTS) {
      if ((e.files as readonly string[]).includes(base)) return events.has(e.id);
    }

    if (base === 'hudmediccharge') {
      if (cls !== 'medic') return false;
      if (n === 'chargelabel' || n === 'chargemeter') return !vaccinator;
      if (n === 'individualchargeslabel' || n === 'resisticon' || /^chargemeter[1-4]$/.test(n)) {
        return vaccinator;
      }
      return true;
    }
    if (base === 'huddemomanpipes') {
      if (cls !== 'demoman' || weapon?.id !== 'stickies') return false;
      if (n === 'pipespresentpanel') return pipes > 0;
      if (n === 'nopipespresentpanel') return pipes === 0;
      return undefined;
    }
    if (base.startsWith('hud_obj_')) {
      if (cls !== 'engineer' && !(base === 'hud_obj_sapper' && cls === 'spy')) return false;
      if (base === 'hud_obj_sentrygun') {
        if (n === 'notbuiltpanel') return sentry === 0;
        if (n === 'builtpanel') return sentry > 0;
        const icon = /^icon_sentry_(\d)$/.exec(n);
        if (icon) return Number(icon[1]) === Math.max(1, sentry);
        const up = /^icon_upgrade_(\d)$/.exec(n);
        if (up) return sentry >= Number(up[1]);
      }
      return undefined;
    }
    if (base === 'hudplayerclass') {
      // The Spy's disguise portrait and the "carrying" banner only show in their situations.
      if (n === 'playerstatusspyimage') return cls === 'spy';
      if (n === 'carryingweapon') return events.has('flag');
    }
    if (base === 'hudaccountpanel') return cls === 'engineer';
    if (base === 'disguisestatuspanel') return cls === 'spy';

    // One meter file per weapon: only the current weapon's.
    if (
      base.startsWith('huditemeffectmeter') ||
      base === 'huddemomancharge' ||
      base === 'hudbowcharge' ||
      base === 'hudrocketpack'
    ) {
      return meter === base;
    }
    return undefined;
  };
}

/** Fill (0–1) of a progress bar, or `undefined` to use the generic "progress bars" slider. */
export function progressFor(s: TestState): (file: string, name: string) => number | undefined {
  const charge = clamp01((s.charge ?? 0) / 100);
  const meter = clamp01((s.meter ?? 0) / 100);
  const vaccinator = currentWeapon(s)?.id === 'vaccinator';
  return (file, rawName) => {
    const base = baseOf(file);
    const n = rawName.toLowerCase();
    if (base === 'hudmediccharge') {
      const bar = /^chargemeter([1-4])$/.exec(n);
      if (vaccinator && bar) return clamp01((charge * 100 - 25 * (Number(bar[1]) - 1)) / 25);
      return charge;
    }
    if (
      base.startsWith('huditemeffectmeter') ||
      base === 'huddemomancharge' ||
      base === 'hudbowcharge' ||
      base === 'hudrocketpack' ||
      base === 'huddemomanpipes'
    ) {
      return meter;
    }
    return undefined;
  };
}

export { TF2_CLASSES };
