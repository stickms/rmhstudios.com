/**
 * Audio, HUD and visual entities. The simulation keeps their state and turns
 * inputs into events; the host draws and plays them.
 *
 * - ambient_generic (SDK: CAmbientGeneric): PlaySound / StopSound /
 *   ToggleSound / Volume / FadeIn / FadeOut / Pitch; spawnflags 1 everywhere,
 *   16 start silent, 32 not looped. env_soundscape: the nearest enabled one in
 *   range with line of sight becomes the active soundscape.
 * - env_fade, env_shake, env_message, game_text, env_hudhint, env_zoom,
 *   env_credits, script_intro.
 * - Visual toggles (lights, sprites, beams, sparks, spotlights, cameras,
 *   monitors, steam, tonemap/colour correction/fog controllers, texture
 *   toggles, material modifiers, particle systems…): `visualOn` plus an
 *   `extra` record the renderer reads.
 * - env_physexplosion / env_physimpact push physics objects.
 */

import type { Entity } from '../../tf2-game/sim/entity';
import { EF_NODRAW } from '../../tf2-game/sim/entity';
import { angleVectors, vec3 } from '../../tf2-game/core/vec';
import { emptyTrace } from '../../tf2-game/core/types';
import { MASK_SOLID_BRUSHONLY } from '../../tf2-game/core/constants';
import { registerSp, SpEntity } from './base';

const color4 = (s: string, a = 255): [number, number, number, number] => {
  const p = s.trim().split(/\s+/).map((n) => parseInt(n, 10) || 0);
  return [p[0] ?? 255, p[1] ?? 255, p[2] ?? 255, p[3] ?? a];
};

// ─── Sound ──────────────────────────────────────────────────────────────────

/** SDK: CAmbientGeneric. */
export class AmbientGeneric extends SpEntity {
  playing = false;
  volume = 10;
  pitch = 100;
  sound = '';
  radius = 1250;
  private sourceName = '';

  override spawn(): void {
    super.spawn();
    this.sound = this.kvString('message');
    this.volume = this.kvNumber('health', 10);
    this.pitch = this.kvNumber('pitch', 100);
    this.radius = this.kvNumber('radius', 1250);
    this.sourceName = this.kvString('SourceEntityName');
    // spawnflags 16 = start silent; otherwise a looping sound starts playing.
    if (!(this.spawnflags & 16) && this.looped() && this.sound) this.setThink(() => this.play(), this.world.curtime + 0.1);
  }

  private looped(): boolean {
    return !(this.spawnflags & 32);
  }

  private source(): number {
    if (this.sourceName) {
      const e = this.sp.findByName(this.sourceName);
      if (e) return e.id;
    }
    return this.id;
  }

  play(): void {
    if (!this.sound) return;
    if (this.playing && this.looped()) return;
    this.playing = this.looped();
    this.sp.emitSound(this.sound, {
      entity: this.source(),
      pos: this.spawnflags & 1 ? undefined : this.origin,
      volume: this.volume / 10,
      pitch: this.pitch,
      loop: this.looped(),
      radius: this.spawnflags & 1 ? 0 : this.radius,
    });
  }

  stop(fade = 0): void {
    if (!this.playing && !this.looped()) return;
    this.playing = false;
    this.sp.emitSound(this.sound, { entity: this.source(), stop: true, fade });
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'playsound':
        if (this.playing && this.looped()) this.stop();
        this.play();
        return true;
      case 'stopsound':
        this.stop();
        return true;
      case 'togglesound':
        if (this.playing) this.stop();
        else this.play();
        return true;
      case 'volume':
        this.volume = parseFloat(value) || 0;
        if (this.volume <= 0) this.stop();
        else this.sp.events.push({ type: 'sound', name: this.sound, entity: this.source(), setVolume: this.volume });
        return true;
      case 'fadein':
        this.play();
        return true;
      case 'fadeout':
        this.stop(parseFloat(value) || 0);
        return true;
      case 'pitch':
        this.pitch = parseFloat(value) || 100;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SDK: env_soundscape — the closest enabled soundscape in range and in view of the player plays. */
export class EnvSoundscape extends SpEntity {
  disabled = false;

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
    this.setThink(this.check, this.world.curtime + 0.1 + (this.id % 10) * 0.015);
  }

  private readonly check = (): void => {
    this.setThink(this.check, this.world.curtime + 0.5);
    if (this.disabled) return;
    const p = this.sp.player;
    const r = this.kvNumber('radius', 128);
    const eye = p.eyePosition(vec3());
    const d = Math.hypot(eye.x - this.origin.x, eye.y - this.origin.y, eye.z - this.origin.z);
    if (r > 0 && d > r) return;
    const tr = emptyTrace();
    this.sp.mapCollision.traceLine(this.origin, eye, MASK_SOLID_BRUSHONLY, null, tr);
    if (tr.fraction < 1) return;
    const name = this.kvString('soundscape');
    if (this.sp.soundscape !== name) this.sp.soundscape = name;
  };

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'togglesoundscape':
        this.disabled = !this.disabled;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── HUD ────────────────────────────────────────────────────────────────────

/** SDK: CEnvFade (spawnflags 1 fade from, 2 modulate, 8 stay out). */
export class EnvFade extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'fade') {
      const c = color4(this.kvString('rendercolor', '0 0 0'));
      c[3] = this.kvNumber('renderamt', 255);
      this.sp.emit({
        type: 'fade',
        color: c,
        duration: this.kvNumber('duration', 2),
        hold: this.kvNumber('holdtime', 0),
        fadeIn: (this.spawnflags & 1) !== 0,
        modulate: (this.spawnflags & 2) !== 0,
        stayOut: (this.spawnflags & 8) !== 0,
      });
      this.fireOutput('OnBeginFade', activator);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** SDK: CPhysicsShake / env_shake (spawnflags 1 global, 4 in air, 8 physics, 16 ropes). */
export class EnvShake extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'startshake' || lc === 'stopshake' || lc === 'amplitude' || lc === 'frequency') {
      this.sp.emit({
        type: 'shake',
        pos: { ...this.origin },
        amplitude: lc === 'amplitude' ? parseFloat(value) || 0 : this.kvNumber('amplitude', 4),
        frequency: lc === 'frequency' ? parseFloat(value) || 0 : this.kvNumber('frequency', 2.5),
        duration: this.kvNumber('duration', 1),
        radius: this.kvNumber('radius', 500),
        stop: lc === 'stopshake',
        global: (this.spawnflags & 1) !== 0,
      });
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** env_message: a titles.txt message name for the HUD. */
export class EnvMessage extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'showmessage') {
      this.sp.emit({ type: 'message', message: this.kvString('message'), entity: this.id });
      const snd = this.kvString('messagesound');
      if (snd) this.sp.emitSound(snd, { entity: this.id });
      this.fireOutput('OnShowMessage', activator);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** SDK: CGameText. */
export class GameText extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'display') {
      this.sp.emit({
        type: 'gametext',
        text: this.kvString('message').replace(/\\n/g, '\n'),
        x: this.kvNumber('x', -1),
        y: this.kvNumber('y', -1),
        color: color4(this.kvString('color', '255 255 255')),
        color2: color4(this.kvString('color2', '255 255 255')),
        effect: this.kvNumber('effect', 0),
        fadeIn: this.kvNumber('fadein', 1.5),
        fadeOut: this.kvNumber('fadeout', 0.5),
        hold: this.kvNumber('holdtime', 1.2),
        fxTime: this.kvNumber('fxtime', 0.25),
        channel: this.kvNumber('channel', 1),
      });
      return true;
    }
    if (lc === 'settext') {
      this.setKv('message', value);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** env_hudhint. */
export class EnvHudHint extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'showhudhint':
        this.sp.emit({ type: 'hudhint', message: this.kvString('message'), show: true });
        return true;
      case 'hidehudhint':
        this.sp.emit({ type: 'hudhint', message: this.kvString('message'), show: false });
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** env_zoom: changes the player's field of view. */
export class EnvZoom extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'zoom') {
      this.sp.emit({ type: 'zoom', fov: this.kvNumber('FOV', 75), rate: this.kvNumber('Rate', 1) });
      return true;
    }
    if (lc === 'unzoom') {
      this.sp.emit({ type: 'zoom', fov: 0, rate: this.kvNumber('Rate', 1) });
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** env_credits. */
export class EnvCredits extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'showlogo' || lc === 'rollcredits' || lc === 'rolloutrocredits') {
      this.sp.emit({ type: 'credits', mode: lc === 'showlogo' ? 'logo' : lc === 'rollcredits' ? 'roll' : 'outro' });
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

// ─── Visual toggles ─────────────────────────────────────────────────────────

const ON_INPUTS = new Set(['turnon', 'showsprite', 'enable', 'start', 'lighton', 'seton', 'setonandturnothersoff', 'startspark', 'startcharge', 'activate', 'startdischarge', 'start_effect']);
const OFF_INPUTS = new Set(['turnoff', 'hidesprite', 'disable', 'stop', 'lightoff', 'setoff', 'stopspark', 'stop_effect', 'deactivate', 'stopdischarge']);

/**
 * Renderable state only: on/off from inputs, plus whatever value-carrying
 * inputs set (colour, width, texture index, bloom scale…) in `extra`.
 */
export class VisualToggle extends SpEntity {
  override spawn(): void {
    super.spawn();
    const startOff =
      this.kvBool('StartDisabled') ||
      (this.classname === 'env_sprite' && !(this.spawnflags & 1) && !!this.targetname) ||
      (this.classname === 'light' || this.classname === 'light_spot' ? (this.spawnflags & 1) !== 0 : false) ||
      (this.classname === 'env_beam' && !(this.spawnflags & 1) && !!this.targetname) ||
      (this.classname === 'env_spark' && !(this.spawnflags & 64)) ||
      (this.classname === 'point_spotlight' && !(this.spawnflags & 1)) ||
      (this.classname === 'info_particle_system' && !this.kvBool('start_active'));
    this.visualOn = !startOff;
    this.extra = { kind: this.classname, on: this.visualOn };
    if (this.classname === 'env_spark' && this.visualOn) this.sparkLater();
  }

  private sparkLater(): void {
    const delay = this.kvNumber('MaxDelay', 0) || 1;
    this.setThink(() => {
      if (!this.visualOn) return;
      this.sp.emit({ type: 'effect', kind: 'spark', pos: { ...this.origin }, entity: this.id, magnitude: this.kvNumber('Magnitude', 1) });
      this.sp.emitSound('DoSpark', { pos: this.origin, quiet: true });
      this.sparkLater();
    }, this.world.curtime + 0.1 + this.sp.random() * delay);
  }

  setOn(on: boolean): void {
    this.visualOn = on;
    if (this.extra) this.extra.on = on;
    if (this.classname === 'env_spark' && on) this.sparkLater();
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'toggle' || lc === 'togglesprite') {
      this.setOn(!this.visualOn);
      return true;
    }
    if (lc === 'sparkonce') {
      this.sp.emit({ type: 'effect', kind: 'spark', pos: { ...this.origin }, entity: this.id });
      return true;
    }
    if (ON_INPUTS.has(lc)) {
      this.setOn(true);
      if (lc === 'setonandturnothersoff') {
        this.sp.forEachEntity((e) => {
          if (e !== this && e.classname === this.classname && e instanceof VisualToggle) e.setOn(false);
        });
      }
      return true;
    }
    if (OFF_INPUTS.has(lc)) {
      this.setOn(false);
      return true;
    }
    if (super.acceptInput(input, value, activator, caller)) return true;
    // Value inputs: keep them for the renderer.
    if (this.extra) {
      if (lc === 'settextureindex') this.extra.textureIndex = parseInt(value, 10) || 0;
      else if (lc === 'incrementtextureindex') this.extra.textureIndex = ((this.extra.textureIndex as number) ?? 0) + 1;
      else this.extra[lc] = value;
    }
    // env_texturetoggle drives its target brushes' texture frame.
    if (this.classname === 'env_texturetoggle' && (lc === 'settextureindex' || lc === 'incrementtextureindex')) {
      for (const t of this.sp.findAllByName(this.kvString('target'))) {
        const sp = t as SpEntity;
        sp.extra = { ...(sp.extra ?? {}), textureFrame: this.extra?.textureIndex ?? 0 };
      }
    }
    return true;
  }
}

/** point_viewcontrol: takes the player's camera (spawnflags 4 freeze, 8 infinite hold, 32 non-solid player). */
export class PointViewControl extends SpEntity {
  active = false;
  private targetEnt: Entity | null = null;

  override spawn(): void {
    super.spawn();
    this.extra = { kind: 'point_viewcontrol', active: false, attachment: '' };
  }

  enable(): void {
    const w = this.sp;
    if (w.viewControl && w.viewControl !== this && w.viewControl instanceof PointViewControl) w.viewControl.disable();
    this.active = true;
    w.viewControl = this;
    if (this.spawnflags & 4) w.player.frozenBy++;
    this.targetEnt = this.kvString('target') ? w.findByName(this.kvString('target')) : null;
    this.extra = { kind: 'point_viewcontrol', active: true, attachment: this.kvString('targetattachment'), target: this.targetEnt?.id ?? -1 };
    const hold = this.kvNumber('wait', 10);
    if (!(this.spawnflags & 8)) this.setThink(() => this.disable(), w.curtime + hold);
    else this.setThink(this.follow, w.curtime + this.sp.tick);
  }

  private readonly follow = (): void => {
    if (!this.active) return;
    const t = this.targetEnt;
    if (t && !t.removed) {
      const f = vec3(t.origin.x - this.origin.x, t.origin.y - this.origin.y, t.origin.z + (t.maxs.z > 0 ? t.maxs.z * 0.9 : 0) - this.origin.z);
      const len = Math.hypot(f.x, f.y, f.z);
      if (len > 1) {
        this.angles.x = (-Math.asin(f.z / len) * 180) / Math.PI;
        this.angles.y = (Math.atan2(f.y, f.x) * 180) / Math.PI;
      }
    }
    this.setThink(this.follow, this.world.curtime + this.sp.tick);
  };

  disable(): void {
    if (!this.active) return;
    this.active = false;
    const w = this.sp;
    if (w.viewControl === this) w.viewControl = null;
    if (this.spawnflags & 4) w.player.frozenBy = Math.max(0, w.player.frozenBy - 1);
    if (this.extra) this.extra.active = false;
    this.setThink(null, -1);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.enable();
        return true;
      case 'disable':
        this.disable();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override onRemove(): void {
    this.disable();
  }
}

/** script_intro: the HL2 intro's blended camera (state for the renderer). */
export class ScriptIntro extends SpEntity {
  override spawn(): void {
    super.spawn();
    this.extra = { kind: 'script_intro', active: false, fov: 0, blendMode: 0, fade: [0, 0, 0, 0], camera: -1 };
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const x = this.extra!;
    switch (input.toLowerCase()) {
      case 'activate':
        x.active = true;
        return true;
      case 'deactivate':
        x.active = false;
        return true;
      case 'setcameraviewentity': {
        const e = this.sp.findByName(value);
        x.camera = e ? e.id : -1;
        return true;
      }
      case 'setblendmode':
      case 'setnextblendmode':
        x.blendMode = parseInt(value, 10) || 0;
        return true;
      case 'setfov':
      case 'setnextfov':
        x.fov = parseFloat(value) || 0;
        return true;
      case 'fadeto':
        x.fade = value.split(/\s+/).map(Number);
        return true;
      default:
        if (super.acceptInput(input, value, activator, caller)) return true;
        x[input.toLowerCase()] = value;
        return true;
    }
  }
}

// ─── Physics nudges ─────────────────────────────────────────────────────────

/** SDK: CPhysExplosion — pushes physics objects in a radius (spawnflags 1 no damage). */
export class EnvPhysExplosion extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() !== 'explode') return super.acceptInput(input, value, activator, caller);
    const mag = this.kvNumber('magnitude', 100);
    const radius = this.kvNumber('radius', 0) || mag * 2.5;
    const c = this.origin;
    for (const b of this.sp.physics.bodies.values()) {
      if (b.kind !== 'dynamic' || b.removed) continue;
      const p = b.getCenter(vec3());
      const d = vec3(p.x - c.x, p.y - c.y, p.z - c.z);
      const dist = Math.hypot(d.x, d.y, d.z);
      if (dist > radius || dist < 1e-3) continue;
      const f = (mag * (1 - dist / radius)) / dist;
      // Impulse magnitude ~ magnitude × mass scale (vphysics' explosion pushes by force over mass).
      b.applyImpulse({ x: d.x * f * 4, y: d.y * f * 4, z: d.z * f * 4 + mag });
    }
    this.sp.emit({ type: 'effect', kind: 'physexplosion', pos: { ...c }, magnitude: mag });
    this.fireOutput('OnPushedPlayer', activator);
    return true;
  }
}

/** SDK: CPhysImpact — a single directional push along its angles. */
export class EnvPhysImpact extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() !== 'impact') return super.acceptInput(input, value, activator, caller);
    const dist = this.kvNumber('distance', 1024);
    const mag = this.kvNumber('magnitude', 100);
    const f = vec3();
    angleVectors(this.angles, f);
    const end = vec3(this.origin.x + f.x * dist, this.origin.y + f.y * dist, this.origin.z + f.z * dist);
    const tr = emptyTrace();
    this.sp.collision.traceLine(this.origin, end, 0x1 | 0x4000, null, tr);
    const b = tr.entity > 0 ? this.sp.bodiesByEntity.get(tr.entity) : undefined;
    if (b) b.applyImpulseAt({ x: f.x * mag * 10, y: f.y * mag * 10, z: f.z * mag * 10 }, tr.endPos);
    return true;
  }
}

registerSp(AmbientGeneric, 'ambient_generic');
registerSp(EnvSoundscape, 'env_soundscape');
registerSp(EnvFade, 'env_fade');
registerSp(EnvShake, 'env_shake');
registerSp(EnvMessage, 'env_message');
registerSp(GameText, 'game_text');
registerSp(EnvHudHint, 'env_hudhint');
registerSp(EnvZoom, 'env_zoom');
registerSp(EnvCredits, 'env_credits');
registerSp(PointViewControl, 'point_viewcontrol');
registerSp(ScriptIntro, 'script_intro');
registerSp(EnvPhysExplosion, 'env_physexplosion');
registerSp(EnvPhysImpact, 'env_physimpact');
registerSp(
  VisualToggle,
  'light',
  'light_spot',
  'light_dynamic',
  'light_environment',
  'env_sprite',
  'env_beam',
  'env_spark',
  'env_steam',
  'env_splash',
  'env_funnel',
  'env_starfield',
  'env_citadel_energy_core',
  'env_smokestack',
  'env_texturetoggle',
  'env_tonemap_controller',
  'env_fog_controller',
  'env_sun',
  'color_correction',
  'material_modify_control',
  'point_spotlight',
  'point_camera',
  'info_particle_system',
  'sky_camera',
  'func_smokevolume',
  'keyframe_rope',
  'move_rope',
  'infodecal',
);

export { EF_NODRAW };
