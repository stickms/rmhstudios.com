/**
 * The unlock items' HUD meters (CHudItemEffectMeter and its kin: hudbowcharge, huddemomancharge,
 * the rage meter) from the owner's private player record and weapon records — what each item's
 * GetEffectLabelText / GetProgress / GetCount would show:
 *
 *   - the effect bar (jars, the cleaver, the drinks; CTFWeaponBase::GetEffectBarProgress) from the
 *     weapon's effectBarRegenTime and the ammo it refills;
 *   - the item charge meter (meters[3]: the Sandvich family, the Gas Passer, the Razorback), the
 *     primary item meter (the Dragon's Fury needle), the energy drink (meters[2]);
 *   - rage (meters[1]: banners), hype (the Soda Popper, Baby Face's Blaster), the shield's charge
 *     (meters[0]), heads and revenge crits (the packed unlockState), the bow's draw, the Loose
 *     Cannon's fuse, the energy weapons' charge.
 *
 * Environment-agnostic.
 */

import { TF_CLASS_DEMOMAN } from '../core/constants';
import { weaponScript } from '../sim/items/scripts';
import { weaponSpecFor } from '../sim/loadout';
import type { NetRecord } from '../sim/net-schema';
import type { HudItemMeter } from './hud-state';

const n = (r: NetRecord, k: string, d = 0): number =>
  typeof r[k] === 'number' ? (r[k] as number) : d;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The effect bar recharge times by script (InternalGetEffectBarRechargeTime). */
const EFFECT_BAR: Readonly<Record<string, { time: number; kind: string; label: string }>> = {
  tf_weapon_jar: { time: 20.1, kind: 'jarate', label: '#TF_JAR' },
  tf_weapon_jar_milk: { time: 20.1, kind: 'bonk', label: '#TF_MADMILK' },
  tf_weapon_cleaver: { time: 5.1, kind: 'cleaver', label: '#TF_CLEAVER' },
  tf_weapon_lunchbox_drink: { time: 30, kind: 'bonk', label: '#TF_ENERGYDRINK' },
};

/** The bow's GetChargeMaxTime (the stock draw, ignoring fire-rate attributes). */
const BOW_DRAW_TIME = 1;
/** The Loose Cannon's grenade_launcher_mortar_mode fuse. */
const CANNON_FUSE = 1;

/** Item meters for the local player's loadout, highest priority first. */
export function adaptItemMeters(
  player: NetRecord,
  weapons: ReadonlyArray<{ slot: number; record: NetRecord }>,
  cls: number,
  curtime: number,
  out: HudItemMeter[],
): HudItemMeter[] {
  out.length = 0;
  const unlock = n(player, 'unlockState');
  const heads = unlock & 0xff;
  const crits = (unlock >>> 8) & 0x3f;
  let hasPipebombLauncher = false;
  for (const w of weapons) {
    const rec = w.record;
    const spec = weaponSpecFor(n(rec, 'defindex', -1), cls);
    const script = spec ? weaponScript(spec.classname) : undefined;
    if (!script) continue;
    const name: string = script.scriptName;
    if (name === 'tf_weapon_pipebomblauncher') hasPipebombLauncher = true;
    const bar = EFFECT_BAR[name];
    if (bar) {
      const ammoKey = `ammo${slotAmmo(script.primaryAmmo)}`;
      const ammo = n(player, ammoKey);
      const regen = n(rec, 'effectBarRegenTime');
      const value =
        ammo > 0 && regen <= 0
          ? 1
          : regen > 0
            ? clamp01((bar.time - (regen - curtime)) / bar.time)
            : 0;
      out.push({ kind: bar.kind, label: bar.label, value });
      continue;
    }
    switch (name) {
      case 'tf_weapon_lunchbox':
        out.push({
          kind: 'sandvich',
          label: '#TF_Sandwich',
          value: clamp01(n(player, 'meter3') / 100),
        });
        break;
      case 'tf_weapon_jar_gas':
        out.push({
          kind: 'gas-passer',
          label: '#TF_Gas',
          value: clamp01(n(player, 'meter3') / 100),
        });
        break;
      case 'tf_weapon_buff_item':
        out.push({
          kind: 'buff-banner',
          label: '#TF_Rage',
          value: clamp01(n(player, 'meter1') / 100),
        });
        break;
      case 'tf_weapon_soda_popper':
        out.push({
          kind: 'sodapopper',
          label: '#TF_Hype',
          value: clamp01(n(player, 'mv_scoutHype') / 100),
        });
        break;
      case 'tf_weapon_pep_brawler_blaster':
        out.push({
          kind: 'sodapopper',
          label: '#TF_Boost',
          value: clamp01(n(player, 'mv_scoutHype') / 100),
        });
        break;
      case 'tf_weapon_compound_bow': {
        const begin = n(rec, 'aux0');
        out.push({
          kind: 'huntsman',
          label: '#TF_Bow',
          value: begin > 0 ? clamp01((curtime - begin) / BOW_DRAW_TIME) : 0,
        });
        break;
      }
      case 'tf_weapon_cannon': {
        const det = n(rec, 'aux0');
        out.push({
          kind: 'fuse',
          label: '#TF_Cannon',
          value: det > 0 ? clamp01((det - curtime) / CANNON_FUSE) : 1,
        });
        break;
      }
      case 'tf_weapon_rocketlauncher_fireball':
        out.push({
          kind: 'pressure',
          label: '#TF_DragonsFury',
          value: clamp01(n(rec, 'aux1') / 100),
        });
        break;
      case 'tf_weapon_drg_pomson':
      case 'tf_weapon_raygun':
      case 'tf_weapon_particle_cannon': {
        const max = 20;
        out.push({
          kind: name === 'tf_weapon_drg_pomson' ? 'pomson' : 'raygun',
          label: '#TF_BISON',
          value: clamp01(n(rec, 'clip') / max),
        });
        break;
      }
      case 'tf_weapon_flaregun_revenge':
      case 'tf_weapon_sentry_revenge':
        out.push({ kind: 'crits', label: '#TF_CRITS', value: crits > 0 ? 1 : 0, count: crits });
        break;
      case 'tf_weapon_sword':
        if (cls === TF_CLASS_DEMOMAN)
          out.push({
            kind: 'eyelander',
            label: '#TF_Heads',
            value: Math.min(heads, 4) / 4,
            count: heads,
          });
        break;
      default:
        break;
    }
  }
  // A Demoman without a stickybomb launcher wears a shield (or boots): the charge meter.
  if (cls === TF_CLASS_DEMOMAN && !hasPipebombLauncher) {
    out.push({ kind: 'shield', label: '#TF_Charge', value: clamp01(n(player, 'meter0') / 100) });
  }
  return out;
}

const AMMO_INDEX: Readonly<Record<string, number>> = {
  primary: 1,
  secondary: 2,
  metal: 3,
  grenades1: 4,
  grenades2: 5,
  grenades3: 6,
};
const slotAmmo = (t: string | null | undefined): number => (t ? (AMMO_INDEX[t] ?? 0) : 0);
