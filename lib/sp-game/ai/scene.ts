/**
 * logic_choreographed_scene (SDK: sceneentity.cpp CSceneEntity) playing a
 * compiled VCD from scenes.image (formats/scene-image.ts).
 *
 * Start runs the scene clock; events fire as it passes their start time:
 * - speak: the actor says the sound script (a 'sound' event on the actor),
 *   with its close caption (token, else the sound name) as a 'caption' event;
 * - sequence / gesture: the actor plays the sequence for the event's span;
 * - moveto: the actor walks (or runs, param2 "Run") to the named entity;
 * - face / lookat: the actor turns toward the named entity;
 * - firetrigger: OnTrigger<param1>;
 * - loop: jumps back to param1 seconds (loop count, −1 forever);
 * - stoppoint: ends the scene there.
 * Pause / Resume / Cancel / Start; OnStart, OnCompletion, OnCanceled.
 * Actor names resolve as the SDK does: !player, !self, !targetN (target1…8
 * keys), then targetname, then classname.
 */

import type { Entity } from '../../tf2-game/sim/entity';
import { registerSp, SpEntity } from '../entities/base';
import { VCD_EVENT, type VcdEvent, type VcdScene } from '../formats/scene-image';
import { stripCaptionTags } from '../formats/captions';
import { SpActor } from './actor';

export class LogicChoreographedScene extends SpEntity {
  scene: VcdScene | null = null;
  playing = false;
  paused = false;
  /** Scene time, seconds. */
  time = 0;
  private next = 0;
  private loopsLeft = new Map<number, number>();
  /** Who said what last (for tests / the HUD). */
  readonly spoken: string[] = [];

  /** The scene path (SceneFile), normalized. */
  get file(): string {
    return this.kvString('SceneFile').replace(/\\/g, '/').toLowerCase();
  }

  start(activator: Entity | null): void {
    if (this.playing && !this.paused) return;
    if (this.playing && this.paused) {
      this.paused = false;
      return;
    }
    this.scene = this.sp.assets.scene(this.file);
    this.playing = true;
    this.paused = false;
    this.time = 0;
    this.next = 0;
    this.loopsLeft.clear();
    this.fireOutput('OnStart', activator);
    if (!this.scene) {
      // A scene the image does not hold finishes at once, so map logic proceeds.
      this.setThink(() => this.finish(), this.world.curtime + 0.1);
    }
  }

  /** Resolves an actor name as the SDK's FindNamedActor / FindNamedTarget. */
  resolve(name: string): Entity | null {
    if (!name) return null;
    const lc = name.toLowerCase();
    if (lc === '!player') return this.sp.player;
    if (lc === '!self') return this;
    const m = /^!target(\d)$/.exec(lc);
    if (m) {
      const t = this.kvString(`target${m[1]}`);
      return t ? this.sp.findByName(t, this, null, null) : null;
    }
    const byName = this.sp.findByName(name, this, null, null);
    if (byName) return byName;
    const byClass = this.sp.findAllByClassname(lc);
    return byClass[0] ?? null;
  }

  simulate(): void {
    if (!this.playing || this.paused || !this.scene) return;
    const sc = this.scene;
    this.time += this.sp.tick;
    while (this.next < sc.events.length && sc.events[this.next].start <= this.time + 1e-6) {
      const ev = sc.events[this.next];
      const idx = this.next;
      this.next++;
      if (!this.runEvent(ev, idx)) return;
    }
    if (this.time >= sc.duration && this.next >= sc.events.length) this.finish();
  }

  /** Returns false when the event ended or rewound the scene. */
  private runEvent(ev: VcdEvent, index: number): boolean {
    const w = this.sp;
    const actor = ev.actor ? this.resolve(ev.actor) : null;
    const span = ev.end > ev.start ? ev.end - ev.start : 0;
    switch (ev.type) {
      case VCD_EVENT.SPEAK: {
        const name = ev.param1;
        w.emitSound(name, { entity: actor ? actor.id : undefined });
        const token = ev.ccToken || name;
        const raw = w.assets.caption(token);
        if (raw !== null) w.emit({ type: 'caption', token, text: stripCaptionTags(raw), duration: span || 3, entity: actor?.id });
        if (actor instanceof SpActor) actor.speakingUntil = w.curtime + span;
        this.spoken.push(name);
        return true;
      }
      case VCD_EVENT.SEQUENCE:
      case VCD_EVENT.GESTURE: {
        if (actor instanceof SpEntity && ev.param1) {
          actor.playSequence(ev.param1, 1, false);
          if (actor instanceof SpActor && ev.type === VCD_EVENT.SEQUENCE) {
            actor.scripted++;
            this.setContextThinkOnce(span || 1, () => {
              actor.scripted = Math.max(0, actor.scripted - 1);
              if (!actor.goal) actor.playActivity('ACT_IDLE');
            });
          }
        }
        return true;
      }
      case VCD_EVENT.MOVETO: {
        const target = this.resolve(ev.param1);
        if (actor instanceof SpActor && target) actor.moveTo(target.origin, ev.param2.toLowerCase() === 'run', null);
        return true;
      }
      case VCD_EVENT.FACE:
      case VCD_EVENT.LOOKAT: {
        const target = this.resolve(ev.param1);
        if (actor instanceof SpActor) {
          actor.faceEntity(target);
          this.setContextThinkOnce(span || 1, () => actor.faceTarget === target && actor.faceEntity(null));
        }
        return true;
      }
      case VCD_EVENT.FIRETRIGGER: {
        const n = parseInt(ev.param1, 10) || 1;
        this.fireOutput(`OnTrigger${n}`, this);
        return true;
      }
      case VCD_EVENT.LOOP: {
        const left = this.loopsLeft.has(index) ? this.loopsLeft.get(index)! : ev.loopCount;
        if (left === 0) return true;
        this.loopsLeft.set(index, left > 0 ? left - 1 : -1);
        const to = parseFloat(ev.param1) || 0;
        this.time = to;
        this.next = this.scene!.events.findIndex((e) => e.start >= to - 1e-6);
        if (this.next < 0) this.next = this.scene!.events.length;
        return false;
      }
      case VCD_EVENT.STOPPOINT:
        this.finish();
        return false;
      default:
        return true;
    }
  }

  private readonly pendingOnce: Array<{ at: number; fn: () => void }> = [];
  private readonly onceCtx = this.context(() => {
    const now = this.world.curtime + 1e-6;
    const due = this.pendingOnce.filter((p) => p.at <= now);
    for (let i = this.pendingOnce.length - 1; i >= 0; i--) if (this.pendingOnce[i].at <= now) this.pendingOnce.splice(i, 1);
    for (const d of due) d.fn();
    if (this.pendingOnce.length > 0) this.setContextThink(this.onceCtx, Math.min(...this.pendingOnce.map((p) => p.at)));
  });

  private setContextThinkOnce(delay: number, fn: () => void): void {
    this.pendingOnce.push({ at: this.world.curtime + delay, fn });
    this.setContextThink(this.onceCtx, Math.min(...this.pendingOnce.map((p) => p.at)));
  }

  finish(): void {
    if (!this.playing) return;
    this.playing = false;
    this.paused = false;
    this.fireOutput('OnCompletion', this);
  }

  cancel(activator: Entity | null): void {
    if (!this.playing) return;
    this.playing = false;
    this.paused = false;
    this.fireOutput('OnCanceled', activator);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'start':
        this.start(activator);
        return true;
      case 'pause':
        if (this.playing) this.paused = true;
        return true;
      case 'resume':
        if (this.playing) this.paused = false;
        return true;
      case 'cancel':
        this.cancel(activator);
        return true;
      case 'reload':
        this.scene = this.sp.assets.scene(this.file);
        return true;
      case 'stopwaitingforactor':
      case 'interjectresponse':
        return true;
      default: {
        const m = /^settarget(\d)$/i.exec(input);
        if (m) {
          this.setKv(`target${m[1]}`, value);
          return true;
        }
        return super.acceptInput(input, value, activator, caller);
      }
    }
  }
}

registerSp(LogicChoreographedScene, 'logic_choreographed_scene', 'logic_scene_list_manager');
