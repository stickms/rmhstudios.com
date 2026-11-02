/**
 * Story-flow point entities (H3.2).
 *
 * `harmonic_flag` — key: `flag` (default for Set/Test when the input carries no name).
 *   Inputs: `Set <name> <value>` (a bare `Set <value>` uses the `flag` key), `Test [name]`.
 *   Outputs: boolean flag: `OnTrue` / `OnFalse`; enum flag: `OnValue<value>` (e.g. `OnValueanchor`);
 *   number flag: `OnValue<n>`. A value of the wrong type is ignored.
 *
 * `harmonic_chapter_end` — input `End`. Saves the flags with the NEXT chapter as the slot's level
 *   (or this one when there is none), fires `OnEnd`, and asks the client for the next chapter. The
 *   client shows "End of the current build" when that chapter has no source yet (chapters.ts).
 *
 * `harmonic_ending` — input `Choose anchor|release|silence`. Sets the `ending` flag, saves, fires
 *   `OnChosen`, and sends the client to the epilogue level (`h7_epilogue_<ending>`).
 */
import type { Entity } from '../../tf2-game/sim/entity';
import { registerSp, SpEntity } from '../../sp-game/entities/base';
import { findHarmonicLevel } from '../levels';
import { flowCommand, nextChapter } from './chapters';
import { epilogueLevel, isEnding } from './endings';
import { getFlags, isFlagName, parseFlagValue } from './flags';

export class HarmonicFlag extends SpEntity {
  /** Called by the checkpoint restore (sp-game/level/checkpoint.ts). */
  afterRestore(): void {
    getFlags(this.sp).restoreLevelStart();
  }

  private resolve(value: string): { name: string; rest: string } {
    const [first, ...tail] = value.trim().split(/\s+/);
    if (first && isFlagName(first)) return { name: first, rest: tail.join(' ') };
    return { name: this.kvString('flag'), rest: value };
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'set': {
        const { name, rest } = this.resolve(value);
        if (isFlagName(name)) {
          const v = parseFlagValue(name, rest);
          if (v !== undefined) getFlags(this.sp).set(name, v);
        }
        return true;
      }
      case 'test': {
        const { name } = this.resolve(value);
        if (!isFlagName(name)) return true;
        const v = getFlags(this.sp).get(name);
        if (typeof v === 'boolean') this.fireOutput(v ? 'OnTrue' : 'OnFalse', activator);
        else this.fireOutput(`OnValue${v}`, activator);
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** The level a chapter hands over to: the next chapter if it has a source, else none. */
function availableNext(levelId: string): string | null {
  const next = nextChapter(levelId);
  return next && findHarmonicLevel(next.id) ? next.id : null;
}

export class HarmonicChapterEnd extends SpEntity {
  private ended = false;

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (input.toLowerCase() !== 'end') return super.acceptInput(input, value, activator, caller);
    if (this.ended) return true;
    this.ended = true;
    const here = this.sp.mapName;
    const target = availableNext(here);
    // The slot continues at the next chapter's start (or here, when there is none yet).
    getFlags(this.sp).persist(target ?? here);
    this.fireOutput('OnEnd', activator);
    this.sp.emit({ type: 'clientcommand', command: flowCommand(target) });
    return true;
  }
}

export class HarmonicEnding extends SpEntity {
  private chosen = false;

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (input.toLowerCase() !== 'choose') return super.acceptInput(input, value, activator, caller);
    const ending = value.trim().toLowerCase();
    if (this.chosen || !isEnding(ending)) return true;
    this.chosen = true;
    const flags = getFlags(this.sp);
    flags.set('ending', ending);
    const level = epilogueLevel(ending);
    const target = findHarmonicLevel(level) ? level : null;
    flags.persist(target ?? this.sp.mapName);
    this.fireOutput('OnChosen', activator);
    this.sp.emit({ type: 'clientcommand', command: flowCommand(target) });
    return true;
  }
}

registerSp(HarmonicFlag, 'harmonic_flag');
registerSp(HarmonicChapterEnd, 'harmonic_chapter_end');
registerSp(HarmonicEnding, 'harmonic_ending');
