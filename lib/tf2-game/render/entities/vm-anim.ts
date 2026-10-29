/**
 * View-model sequence selection (pure; viewmodel.ts drives it): the weapon's networked or
 * predicted view-model activity (sim VM_ACTIVITY_NAMES id + its change counter, the SDK's
 * m_nAnimationParity) → the arms' sequence, played through the Animator's transitioner.
 *
 *   - Translation (CTFWeaponBase::TranslateViewmodelHandActivityInternal): the item's own table
 *     (`vmActivities`, its activity overrides), then s_viewmodelacttable for the weapon's role
 *     (acttables.ts — the minigun's ACT_MP_ATTACK_STAND_PREFIRE → ACT_PRIMARY_ATTACK_STAND_PREFIRE,
 *     wind-up), then the base activity itself.
 *   - Restarts follow the counter like the parity flag: a sequence restarts only when the counter
 *     moved. A looping sequence already playing for the activity is never restarted — the
 *     minigun's spin and fire loops and every idle keep their cycle however often the weapon
 *     re-sends them (the SDK's CTFMinigun::SendWeaponAnim lets the fire loop continue; here
 *     every shot still bumps the counter, which keys the per-shot muzzle flash; the spin is
 *     re-sent every tick) and across prediction replays that re-derive the counter.
 *   - An activity the arms do not have changes nothing (the current sequence keeps playing).
 *   - Changes cross-fade over the sequences' fade times (Animator.setSequence); a STUDIO_SNAP
 *     sequence change blends over VM_SNAP_BLEND instead of Source's hard cut, since a predicted
 *     view model changes sequence at tick, not animation, boundaries.
 */
import { VIEWMODEL_ACTTABLE } from './acttables';
import type { Animator, SequenceDesc } from './animator';

/** Blend time for a STUDIO_SNAP view-model sequence change (seconds; ~3 frames at 60 Hz). */
export const VM_SNAP_BLEND = 0.05;

/** What a weapon contributes to the translation: its role and its own activity table. */
export interface VmWeaponTable {
  role: string;
  vmActivities: Readonly<Record<string, string>>;
}

/** The arms activities to try for a base activity, best first (deduplicated). */
export function vmActivityCandidates(base: string, w: VmWeaponTable | undefined): string[] {
  const out: string[] = [];
  const add = (a: string | undefined) => {
    if (a && !out.includes(a)) out.push(a);
  };
  add(w?.vmActivities[base]);
  if (w) add(VIEWMODEL_ACTTABLE[w.role]?.[base]);
  add(base);
  return out;
}

/** The arms sequence for a base activity (SelectWeightedSequence over the first activity found). */
export function resolveVmSequence(
  anim: Pick<Animator, 'set'>,
  base: string,
  w: VmWeaponTable | undefined,
  random?: () => number,
): { activity: string; seq: SequenceDesc } | null {
  for (const act of vmActivityCandidates(base, w)) {
    const seq = anim.set.selectWeightedSequence(act, random);
    if (seq) return { activity: act, seq };
  }
  return null;
}

/** What a view-model update did. */
export type VmPlayResult = 'none' | 'continue' | 'restart' | 'change';

/**
 * Plays a base view-model activity on the arms (viewmodel.ts calls it when the weapon's
 * activity, its change counter or the weapon changed). `restart`: the counter moved — a
 * one-shot then plays again from the start. Returns 'none' (no such activity: nothing changes),
 * 'continue' (re-sent: the playing loop goes on), 'restart' (same sequence from the start,
 * cross-faded) or 'change' (another sequence, cross-faded).
 */
export function playVmActivity(
  anim: Animator,
  base: string,
  w: VmWeaponTable | undefined,
  restart: boolean,
): VmPlayResult {
  if (!base) return 'none';
  const r = resolveVmSequence(anim, base, w);
  if (!r) return 'none';
  anim.snapBlend = VM_SNAP_BLEND;
  const main = anim.main;
  if (main) {
    // A looping sequence of this activity already playing keeps its cycle.
    const list = anim.set.activities.get(r.activity);
    if (main.seq.looping && list)
      for (const e of list) if (e.seq === main.seq.name) return 'continue';
    if (main.seq === r.seq) {
      if (r.seq.looping || !restart) return 'continue';
      anim.setSequence(r.seq, { restart: true });
      return 'restart';
    }
  }
  anim.setSequence(r.seq, { restart: true });
  return 'change';
}
