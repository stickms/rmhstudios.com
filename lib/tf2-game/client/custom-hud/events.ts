/**
 * The HUD animation events (`scripts/hudanimations_*.txt`) the game starts as
 * the match changes — so a custom HUD's own animations play in game: the
 * health flash when hit, the overheal and low-health pulses, the low-ammo
 * pulse, Über ready, the metal counter's flash, the disguise fade, the KOTH
 * clock highlight, overtime.
 *
 * The player-number events are the editor's own (`animationEvents`, the same
 * triggers its Play mode uses), run on the adapted test states; the rest come
 * from what only the live game knows. Pure; tested in events.test.ts.
 */

import { animationEvents } from '@/lib/tf2-hud/play/anim-events';
import type { TestState } from '@/lib/tf2-hud/fixtures';
import type { HudState } from '../hud-state';

/** Seconds a timer must jump up by to count as time added (a capture's bonus), not rounding. */
const TIMER_ADDED = 2;

export function hudAnimEvents(
  prev: { state: HudState; test: TestState } | null,
  next: { state: HudState; test: TestState },
): string[] {
  const out = animationEvents(prev?.test ?? null, next.test);
  if (!prev) return out;
  const a = prev.state;
  const b = next.state;

  const la = a.local;
  const lb = b.local;
  if (la && lb && la.id === lb.id && lb.alive) {
    // CHudAccountPanel: metal gained / spent.
    const ma = la.engineer?.metal;
    const mb = lb.engineer?.metal;
    if (ma !== undefined && mb !== undefined && ma !== mb)
      out.push(mb > ma ? 'AccountMoneyAdded' : 'AccountMoneyRemoved');
    // The Spy's disguise panel.
    const da = la.conditions.disguised || la.conditions.disguising;
    const db = lb.conditions.disguised || lb.conditions.disguising;
    if (!da && db) out.push('HudSpyDisguiseFadeIn');
    else if (da && !db) out.push('HudSpyDisguiseFadeOut');
    else if (db && la.conditions.disguiseClass !== lb.conditions.disguiseClass)
      out.push('HudSpyDisguiseChanged');
    // A building of ours got sapped.
    const sapped = (s: HudState) =>
      !!s.local?.engineer &&
      ['sentry', 'dispenser', 'entrance', 'exit'].some(
        (k) => s.local!.engineer![k as 'sentry'].sapped,
      );
    if (!sapped(a) && sapped(b)) out.push('SpyWarningFlash');
    else if (sapped(a) && !sapped(b)) out.push('SpyWarningFlashEnd');
  }

  // Picking up / losing the intelligence.
  const carryA = a.match.flags.some((f) => f.carriedByLocal);
  const carryB = b.match.flags.some((f) => f.carriedByLocal);
  if (!carryA && carryB) out.push('FlagOutline');
  else if (carryA && !carryB) out.push('FlagOutlineHide');

  // The round clock: time added, overtime.
  const ta = a.match.timer;
  const tb = b.match.timer;
  if (ta && tb && tb.remaining - ta.remaining >= TIMER_ADDED) out.push('TimerIncrement');
  if (tb?.overtime && !ta?.overtime) out.push('OvertimeShow');

  // King of the Hill: the clock that runs changes hands.
  const ka = a.match.koth?.active ?? 0;
  const kb = b.match.koth?.active ?? 0;
  if (ka !== kb) out.push(kb ? 'ActiveTimerHighlight' : 'ActiveTimerDim');

  // Payload: the cart starts rolling back.
  const recA = a.match.payloads.some((p) => p.receding);
  const recB = b.match.payloads.some((p) => p.receding);
  if (!recA && recB) out.push('HudCartAlarmPulse');
  else if (recA && !recB) out.push('HudCartAlarmPulseStop');

  return out;
}
