/**
 * The one running animation controller for the editor, with a timer that only runs while something is moving.
 * Components subscribe to its snapshot; nothing here touches React.
 */

import { AnimController, type AnimEnv } from './controller';
import { emptyScript, type AnimScript } from './parse';
import { EMPTY_SNAPSHOT, snapshotOf, type AnimSnapshot } from './style';

const TICK_MS = 33;
const nowSeconds = (): number =>
  (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

export class AnimRuntime {
  private ctl: AnimController | null = null;
  private script: AnimScript = emptyScript();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  snapshot: AnimSnapshot = EMPTY_SNAPSHOT;

  /** Use `script` and resolve start values through `env`. A different script starts fresh. */
  configure(script: AnimScript, env: AnimEnv): void {
    if (!this.ctl || script !== this.script) {
      this.stopAll();
      this.script = script;
      this.ctl = new AnimController(script, env);
    } else {
      this.ctl.setEnv(env);
    }
  }

  eventNames(): string[] {
    return [...this.script.events.values()].map((e) => e.name);
  }

  hasEvent(name: string): boolean {
    return this.script.events.has(name.toLowerCase());
  }

  /** Start an event now. False when it does not exist (or nothing is configured). */
  fire(name: string): boolean {
    const ctl = this.ctl;
    if (!ctl) return false;
    const t = nowSeconds();
    ctl.advance(t);
    if (!ctl.fire(name, t)) return false;
    this.tick();
    this.ensureTimer();
    return true;
  }

  stopAll(): void {
    this.ctl?.reset();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.snapshot !== EMPTY_SNAPSHOT) {
      this.snapshot = EMPTY_SNAPSHOT;
      this.emit();
    }
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): AnimSnapshot => this.snapshot;

  private tick(): void {
    const ctl = this.ctl;
    if (!ctl) return;
    if (ctl.advance(nowSeconds())) {
      this.snapshot = snapshotOf(ctl);
      this.emit();
    }
    if (!ctl.busy && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private ensureTimer(): void {
    if (this.timer || !this.ctl?.busy) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }
}

export const animRuntime = new AnimRuntime();
