/**
 * Narrative point entities (H3.1).
 *
 * `harmonic_dialogue` — keys: `script` (a script id), `interrupt` (1 = replace what is playing).
 *   Inputs: `Start`, `Cancel`. Outputs: `OnLine<N>` (1-based, when line N appears), `OnFinished`
 *   (plus the script's `then` names), `OnCancelled`. A `once` script that already played is ignored.
 *
 * `harmonic_hint` — keys: `hintkey`, `hinttext` (the English default), `duration` (seconds; 0 =
 *   until hidden). Inputs: `ShowHint`, `HideHint`. Feeds `hud.hint`.
 *
 * Both tick the world's narrative service from their own think.
 */
import { TICK_INTERVAL } from '../../tf2-game/core/constants';
import type { Entity } from '../../tf2-game/sim/entity';
import { registerSp, SpEntity } from '../../sp-game/entities/base';
import type { DialogueEvent } from './runner';
import { findScript } from './scripts';
import { attachNarrative, type NarrativeService } from './service';

abstract class NarrativeEntity extends SpEntity {
  protected narrative!: NarrativeService;

  override spawn(): void {
    super.spawn();
    this.narrative = attachNarrative(this.sp);
    this.setThink(this.pump, this.sp.curtime + TICK_INTERVAL);
  }

  private readonly pump = (): void => {
    this.narrative.tick();
    this.afterPump();
    this.setThink(this.pump, this.sp.curtime + TICK_INTERVAL);
  };

  protected afterPump(): void {}

  /** Called by the checkpoint restore (sp-game/level/checkpoint.ts). */
  afterRestore(): void {
    this.narrative.reset();
  }
}

export class HarmonicDialogue extends NarrativeEntity {
  private off: (() => void) | null = null;

  override spawn(): void {
    super.spawn();
    this.off = this.narrative.runner.on((e) => this.onEvent(e));
  }

  private onEvent(e: DialogueEvent): void {
    if (e.source !== this) return;
    if (e.type === 'line') {
      this.fireOutput(`OnLine${e.index + 1}`, this.sp.player);
    } else if (e.type === 'finished') {
      this.fireOutput('OnFinished', this.sp.player);
      for (const name of e.script.then ?? []) this.fireOutput(name, this.sp.player);
    } else {
      this.fireOutput('OnCancelled', this.sp.player);
    }
  }

  override onRemove(): void {
    this.off?.();
    this.off = null;
    super.onRemove();
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'start': {
        const script = findScript(this.kvString('script'));
        if (script)
          this.narrative.runner.start(script, {
            source: this,
            interrupt: this.kvNumber('interrupt', 0) !== 0,
          });
        return true;
      }
      case 'cancel':
        this.narrative.runner.cancel(this);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

export class HarmonicHint extends NarrativeEntity {
  private hideAt = -1;

  protected override afterPump(): void {
    if (this.hideAt >= 0 && this.sp.curtime >= this.hideAt) {
      this.hideAt = -1;
      this.narrative.hideHint(this);
    }
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'showhint': {
        const key = this.kvString('hintkey');
        if (!key) return true;
        this.narrative.showHint(this, key, this.kvString('hinttext'));
        const d = this.kvNumber('duration', 0);
        this.hideAt = d > 0 ? this.sp.curtime + d : -1;
        return true;
      }
      case 'hidehint':
        this.hideAt = -1;
        this.narrative.hideHint(this);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(HarmonicDialogue, 'harmonic_dialogue');
registerSp(HarmonicHint, 'harmonic_hint');
