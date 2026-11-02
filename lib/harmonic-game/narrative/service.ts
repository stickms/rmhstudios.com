/**
 * The per-world narrative service (H3.1): the dialogue runner on the sim clock, the hint line, the
 * audio for radio lines and the HUD read. Attached lazily by the first `harmonic_dialogue` /
 * `harmonic_hint` entity (`attachNarrative`), and ticked by those entities' thinks, so a level
 * that has neither costs nothing and `sim/index.ts` needs no change.
 *
 *   const n = attachNarrative(world);
 *   n.runner.start(findScript('dev.radio_check')!);
 *   getNarrative(world)?.readHud(hudNow);   // → { subtitles, hint } for the HUD
 */
import { IN_USE } from '../../tf2-game/core/constants';
import type { SpWorld } from '../../sp-game/world/sp-world';
import { harmonicSounds } from '../audio/events';
import type { HarmonicHudState } from '../client/hud-state';
import { RADIO_CLICK_VOLUME, RADIO_STATIC_VOLUME, SKIP_GRACE_S } from './constants';
import { DialogueRunner } from './runner';
import { speakerName } from './speakers';

export interface HintState {
  /** Whoever showed it (an entity); `hide(owner)` only hides its own. */
  owner: unknown;
  key: string;
  defaultValue: string;
}

export class NarrativeService {
  readonly runner: DialogueRunner;
  hint: HintState | null = null;
  private lastTick = -1;
  private usePrev = false;

  constructor(readonly world: SpWorld) {
    this.runner = new DialogueRunner(() => world.curtime);
    this.runner.on((e) => {
      // Radio: a click and the static bed open every radio line; a click closes the set.
      if (e.type === 'line' && e.line.channel === 'radio') {
        harmonicSounds.sfx('radio.click', { volume: RADIO_CLICK_VOLUME });
        harmonicSounds.sfx('radio.static', { volume: RADIO_STATIC_VOLUME });
      } else if (e.type === 'finished' || e.type === 'cancelled') {
        if (e.script.lines.some((l) => l.channel === 'radio'))
          harmonicSounds.sfx('radio.click', { volume: RADIO_CLICK_VOLUME });
      }
    });
  }

  /** Once per sim tick (idempotent within one tick): the runner, and +use to skip a line. */
  tick(): void {
    const now = this.world.curtime;
    if (now === this.lastTick) return;
    this.lastTick = now;
    const use = (this.world.player.lastCmd.buttons & IN_USE) !== 0;
    const cur = this.runner.current();
    if (use && !this.usePrev && cur && now - cur.startedAt >= SKIP_GRACE_S) this.runner.skip();
    this.usePrev = use;
    this.runner.tick();
  }

  showHint(owner: unknown, key: string, defaultValue: string): void {
    this.hint = { owner, key, defaultValue };
  }

  hideHint(owner: unknown): void {
    if (!owner || this.hint?.owner === owner) this.hint = null;
  }

  /** Level-start state (a death reload): nothing playing, no hint, `once` forgotten. */
  reset(): void {
    this.runner.reset();
    this.hint = null;
    this.usePrev = false;
  }

  /**
   * The HUD slice. `hudNow` is the HUD clock (`HudState.now`), which keeps running behind the pause
   * menu; `until` is `hudNow` plus the sim time the line has left, so a paused line stays up.
   */
  readHud(hudNow: number): Pick<HarmonicHudState, 'subtitles' | 'hint'> {
    const cur = this.runner.current();
    const subtitles: HarmonicHudState['subtitles'] = [];
    if (cur) {
      subtitles.push({
        speaker: speakerName(cur.line.speaker),
        speakerId: cur.line.speaker,
        channel: cur.line.channel ?? 'voice',
        key: cur.line.key,
        defaultValue: cur.line.defaultValue,
        until: hudNow + Math.max(0, cur.endsAt - this.world.curtime),
      });
    }
    return {
      subtitles,
      hint: this.hint ? { key: this.hint.key, defaultValue: this.hint.defaultValue } : null,
    };
  }
}

const services = new WeakMap<SpWorld, NarrativeService>();

export function getNarrative(world: SpWorld): NarrativeService | null {
  return services.get(world) ?? null;
}

export function attachNarrative(world: SpWorld): NarrativeService {
  let s = services.get(world);
  if (!s) {
    s = new NarrativeService(world);
    services.set(world, s);
  }
  return s;
}

/** Merges the narrative slice into a HUD state (no-op when the world has no narrative service). */
export function applyNarrativeHud(
  hud: HarmonicHudState,
  world: SpWorld | null,
  hudNow: number,
): HarmonicHudState {
  const n = world ? getNarrative(world) : null;
  if (!n) return hud;
  const slice = n.readHud(hudNow);
  hud.subtitles = slice.subtitles;
  hud.hint = slice.hint;
  return hud;
}
