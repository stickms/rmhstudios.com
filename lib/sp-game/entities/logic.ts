/**
 * Map logic for single player (SDK: logicauto.cpp, logicrelay.cpp,
 * logic_timer in logicentities.cpp, logic_case, logic_branch, math_counter,
 * math_remap, env_global (globalstate), logic_autosave (point_*), point_template
 * (templates.cpp), env_entity_maker, point_teleport, point_clientcommand,
 * path_corner, path_track). logic_relay and the filters are the TF classes.
 */

import { BspEntity } from '../../tf2-game/formats/keyvalues';
import { Entity, PointEntity } from '../../tf2-game/sim/entity';
import { LogicRelay } from '../../tf2-game/sim/logic';
import { FilterClass, FilterMulti, FilterName } from '../../tf2-game/sim/triggers';
import { angleVectors, copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { matFromAngles, matMulVec } from '../math';
import { registerSp, SpEntity } from './base';

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))));

// ─── logic_auto ─────────────────────────────────────────────────────────────

/** SDK: CLogicAuto::Think — load-type outputs, then OnMapSpawn, 0.2 s after spawn. */
export class SpLogicAuto extends SpEntity {
  override activate(): void {
    super.activate();
    this.setThink(this.autoThink, this.world.curtime + 0.2);
  }

  private readonly autoThink = (): void => {
    const g = this.kvString('globalstate');
    if (g && (this.sp.globals.get(g.toLowerCase()) ?? 0) !== 1) return;
    const lt = this.sp.loadType;
    if (lt === 'transition') this.fireOutput('OnMapTransition', null);
    else if (lt === 'new') this.fireOutput('OnNewGame', null);
    else if (lt === 'load') this.fireOutput('OnLoadGame', null);
    this.fireOutput('OnMapSpawn', null);
    if (this.spawnflags & 1) this.world.remove(this);
  };
}

// ─── logic_timer ────────────────────────────────────────────────────────────

/** SDK: CTimerEntity. */
export class LogicTimer extends SpEntity {
  disabled = false;
  refireTime = 0;
  useRandom = false;
  lower = 0;
  upper = 0;
  oscillatorHigh = false;

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
    this.useRandom = this.kvBool('UseRandomTime');
    this.lower = this.kvNumber('LowerRandomBound', 0);
    this.upper = this.kvNumber('UpperRandomBound', 0);
    this.refireTime = this.useRandom ? 0 : Math.max(0.01, this.kvNumber('RefireTime', 0));
    if (!this.disabled) this.arm();
  }

  private next(): number {
    return this.useRandom ? this.sp.randomFloat(this.lower, this.upper) : this.refireTime;
  }

  private arm(): void {
    this.setThink(this.fire, this.world.curtime + Math.max(0.015, this.next()));
  }

  private readonly fire = (): void => {
    if (this.disabled) return;
    if (this.spawnflags & 1) {
      this.fireOutput(this.oscillatorHigh ? 'OnTimerLow' : 'OnTimerHigh', this);
      this.oscillatorHigh = !this.oscillatorHigh;
    } else this.fireOutput('OnTimer', this);
    this.arm();
  };

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const v = parseFloat(value) || 0;
    switch (input.toLowerCase()) {
      case 'enable':
        if (this.disabled) {
          this.disabled = false;
          this.arm();
        }
        return true;
      case 'disable':
        this.disabled = true;
        this.setThink(null, -1);
        return true;
      case 'toggle':
        return this.acceptInput(this.disabled ? 'Enable' : 'Disable', '', activator, caller);
      case 'refiretime':
        this.refireTime = Math.max(0.01, v);
        if (!this.disabled) this.arm();
        return true;
      case 'resettimer':
        if (!this.disabled) this.arm();
        return true;
      case 'firetimer':
        this.fireOutput('OnTimer', activator ?? this);
        if (!this.disabled) this.arm();
        return true;
      case 'lowerrandombound':
        this.lower = v;
        return true;
      case 'upperrandombound':
        this.upper = v;
        return true;
      case 'addtotimer':
        if (this.nextThink >= 0) this.setThink(this.fire, this.nextThink + v);
        return true;
      case 'subtractfromtimer':
        if (this.nextThink >= 0) this.setThink(this.fire, Math.max(this.world.curtime, this.nextThink - v));
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── logic_case / logic_branch ──────────────────────────────────────────────

/** SDK: CLogicCase. */
export class LogicCase extends SpEntity {
  private shuffle: number[] = [];

  private cases(): Array<[number, string]> {
    const out: Array<[number, string]> = [];
    for (let i = 1; i <= 16; i++) {
      const v = this.kv?.get(`Case${String(i).padStart(2, '0')}`);
      if (v !== undefined && v !== '') out.push([i, v]);
    }
    return out;
  }

  private fireCase(i: number, activator: Entity | null): void {
    this.fireOutput(`OnCase${String(i).padStart(2, '0')}`, activator);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'invalue': {
        const n = parseFloat(value);
        for (const [i, c] of this.cases()) {
          const cn = parseFloat(c);
          if (c === value || (Number.isFinite(n) && Number.isFinite(cn) && cn === n)) {
            this.fireCase(i, activator);
            return true;
          }
        }
        this.fireOutput('OnDefault', activator, value);
        return true;
      }
      case 'pickrandom': {
        const cs = this.cases();
        if (cs.length === 0) return true;
        const pick = cs[Math.min(cs.length - 1, Math.floor(this.sp.random() * cs.length))];
        this.fireCase(pick[0], activator);
        return true;
      }
      case 'pickrandomshuffle': {
        if (this.shuffle.length === 0) this.shuffle = this.cases().map(([i]) => i);
        if (this.shuffle.length === 0) return true;
        const k = Math.min(this.shuffle.length - 1, Math.floor(this.sp.random() * this.shuffle.length));
        const i = this.shuffle.splice(k, 1)[0];
        this.fireCase(i, activator);
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SDK: CLogicBranch. */
export class LogicBranch extends SpEntity {
  value = false;

  override spawn(): void {
    super.spawn();
    this.value = this.kvBool('InitialValue');
  }

  private test(activator: Entity | null): void {
    this.fireOutput(this.value ? 'OnTrue' : 'OnFalse', activator);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'setvalue':
        this.value = (parseFloat(value) || 0) !== 0;
        return true;
      case 'setvaluetest':
        this.value = (parseFloat(value) || 0) !== 0;
        this.test(activator);
        return true;
      case 'toggle':
        this.value = !this.value;
        return true;
      case 'toggletest':
        this.value = !this.value;
        this.test(activator);
        return true;
      case 'test':
        this.test(activator);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── math_counter / math_remap ──────────────────────────────────────────────

/** SDK: CMathCounter. */
export class MathCounter extends SpEntity {
  value = 0;
  min = 0;
  max = 0;
  hitMin = false;
  hitMax = false;
  disabled = false;

  override spawn(): void {
    super.spawn();
    this.min = this.kvNumber('min', 0);
    this.max = this.kvNumber('max', 0);
    this.value = this.kvNumber('startvalue', 0);
    this.disabled = this.kvBool('StartDisabled');
    if (this.min !== 0 || this.max !== 0) this.value = Math.min(Math.max(this.value, this.min), this.max);
  }

  /** SDK: CMathCounter::UpdateOutValue. */
  private update(v: number, activator: Entity | null, fire = true): void {
    let nv = v;
    if (this.min !== 0 || this.max !== 0) {
      if (nv >= this.max) {
        nv = this.max;
        if (!this.hitMax) {
          this.hitMax = true;
          this.fireOutput('OnHitMax', activator);
        }
      } else this.hitMax = false;
      if (nv <= this.min) {
        nv = this.min;
        if (!this.hitMin) {
          this.hitMin = true;
          this.fireOutput('OnHitMin', activator);
        }
      } else this.hitMin = false;
    }
    this.value = nv;
    if (fire) this.fireOutput('OutValue', activator, fmt(nv));
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const v = parseFloat(value) || 0;
    const lc = input.toLowerCase();
    if (this.disabled && lc !== 'enable' && lc !== 'kill') return true;
    switch (lc) {
      case 'add':
        this.update(this.value + v, activator);
        return true;
      case 'subtract':
        this.update(this.value - v, activator);
        return true;
      case 'multiply':
        this.update(this.value * v, activator);
        return true;
      case 'divide':
        if (v !== 0) this.update(this.value / v, activator);
        return true;
      case 'setvalue':
        this.update(v, activator);
        return true;
      case 'setvaluenofire':
        this.update(v, activator, false);
        return true;
      case 'sethitmax':
        this.max = v;
        if (this.max < this.min) this.min = this.max;
        this.update(this.value, activator);
        return true;
      case 'sethitmin':
        this.min = v;
        if (this.max < this.min) this.max = this.min;
        this.update(this.value, activator);
        return true;
      case 'getvalue':
        this.fireOutput('OnGetValue', activator, fmt(this.value));
        return true;
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** SDK: CMathRemap. */
export class MathRemap extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() !== 'invalue') return super.acceptInput(input, value, activator, caller);
    const v = parseFloat(value) || 0;
    const in1 = this.kvNumber('in1', 0);
    const in2 = this.kvNumber('in2', 1);
    const out1 = this.kvNumber('out1', 0);
    const out2 = this.kvNumber('out2', 1);
    if (this.spawnflags & 1 && (v < Math.min(in1, in2) || v > Math.max(in1, in2))) return true;
    let t = in2 !== in1 ? (v - in1) / (in2 - in1) : 0;
    if (this.spawnflags & 2) t = Math.min(1, Math.max(0, t));
    this.fireOutput('OutValue', activator, fmt(out1 + (out2 - out1) * t));
    return true;
  }
}

// ─── env_global / logic_autosave ────────────────────────────────────────────

/** SDK: CEnvGlobal — named on/off/dead states (and a counter) that survive level changes. */
export class EnvGlobal extends SpEntity {
  private name = '';

  override spawn(): void {
    super.spawn();
    this.name = this.kvString('globalstate').toLowerCase();
    if (this.name && !this.sp.globals.has(this.name) && this.spawnflags & 1) this.sp.globals.set(this.name, this.kvNumber('initialstate', 0));
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const g = this.sp.globals;
    const k = this.name;
    switch (input.toLowerCase()) {
      case 'turnon':
        g.set(k, 1);
        return true;
      case 'turnoff':
        g.set(k, 0);
        return true;
      case 'toggle':
        g.set(k, g.get(k) === 1 ? 0 : 1);
        return true;
      case 'remove':
        g.set(k, 2);
        return true;
      case 'setcounter':
        g.set(`${k}#counter`, parseFloat(value) || 0);
        return true;
      case 'addtocounter':
        g.set(`${k}#counter`, (g.get(`${k}#counter`) ?? 0) + (parseFloat(value) || 0));
        return true;
      case 'getcounter':
        this.fireOutput('OutCounter', activator, fmt(g.get(`${k}#counter`) ?? 0));
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

/** logic_autosave: the checkpoint the player returns to on death. */
export class LogicAutosave extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'save':
        this.sp.saveCheckpoint(false);
        return true;
      case 'savedangerous': {
        // SDK: saves now, then keeps it only if the player is still healthy after the delay.
        const delay = parseFloat(value) || 0;
        const minHealth = this.kvNumber('MinimumHitPoints', 0);
        if (delay <= 0) {
          if (this.sp.player.health > minHealth) this.sp.saveCheckpoint(true);
        } else {
          this.setThink(() => {
            if (!this.sp.player.dead && this.sp.player.health > minHealth) this.sp.saveCheckpoint(true);
          }, this.world.curtime + delay);
        }
        return true;
      }
      case 'setminhitpointsthreshold':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── Templates ──────────────────────────────────────────────────────────────

let templateInstance = 0;

/** SDK: CPointTemplate — spawns copies of its template entities, with name fix-up unless asked to preserve names. */
export class PointTemplate extends SpEntity {
  /** Template keyvalue sets (with their original origins). */
  templateKvs(): BspEntity[] {
    const out: BspEntity[] = [];
    for (let i = 1; i <= 16; i++) {
      const n = this.kvString(`Template${String(i).padStart(2, '0')}`);
      if (!n) continue;
      const list = this.sp.templateLists.get(n.toLowerCase());
      if (list) for (const kv of list) if (!out.includes(kv)) out.push(kv);
    }
    return out;
  }

  /**
   * SDK: CPointTemplate::CreateInstance. Entities keep their offset from the
   * template (rotated by `angles`) around `origin`; returns them spawned.
   */
  createInstance(origin: Vec3 | null, angles: Vec3 | null): Entity[] {
    const kvs = this.templateKvs();
    const preserve = (this.spawnflags & 2) !== 0;
    const suffix = `&${String(++templateInstance).padStart(4, '0')}`;
    const localNames = new Set(kvs.map((k) => (k.get('targetname') ?? '').toLowerCase()).filter((n) => n));
    const m = new Float64Array(9);
    if (angles) matFromAngles(angles, m);
    const created: Entity[] = [];
    for (const kv of kvs) {
      const props: Array<[string, string]> = [];
      for (const [k, v] of kv.props) {
        const lk = k.toLowerCase();
        let val = v;
        if (!preserve) {
          if ((lk === 'targetname' || lk === 'parentname' || lk === 'target') && localNames.has(v.toLowerCase())) val = v + suffix;
          else if ((lk.startsWith('on') || lk.startsWith('out')) && (v.includes(',') || v.includes('\x1b'))) {
            const sep = v.includes('\x1b') ? '\x1b' : ',';
            const parts = v.split(sep);
            if (localNames.has((parts[0] ?? '').toLowerCase())) parts[0] += suffix;
            val = parts.join(sep);
          }
        }
        if (lk === 'origin' && origin) {
          const p = new BspEntity([['origin', v]]).origin;
          const off = vec3(p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z);
          if (angles) matMulVec(m, off, off);
          val = `${origin.x + off.x} ${origin.y + off.y} ${origin.z + off.z}`;
        }
        if (lk === 'angles' && angles) {
          const a = new BspEntity([['angles', v]]).angles;
          val = `${a.x + angles.x} ${a.y + angles.y} ${a.z + angles.z}`;
        }
        props.push([k, val]);
      }
      const e = this.sp.spawnEntity(kv.classname, undefined, new BspEntity(props));
      created.push(e);
    }
    for (const e of created) this.fireOutput('OnEntitySpawned', e);
    return created;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'forcespawn') {
      this.createInstance(null, null);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** SDK: CEnvEntityMaker — spawns its point_template at its own position. */
export class EnvEntityMaker extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'forcespawn' || lc === 'forcespawnattarget' || lc === 'forcespawnatentityorigin') {
      const t = this.sp.findByName(this.kvString('EntityTemplate'));
      if (!(t instanceof PointTemplate)) {
        this.fireOutput('OnEntityFailedSpawn', activator);
        return true;
      }
      let origin: Vec3 = this.origin;
      if (lc !== 'forcespawn' && value) {
        const target = this.sp.findByName(value, this, activator, caller);
        if (target) origin = target.origin;
      }
      // The template's offsets are around the template; the maker places them around itself.
      const created = t.createInstance(origin, this.angles);
      const dir = this.kv?.getVec3('PostSpawnDirection') ?? vec3();
      const speed = this.kvNumber('PostSpawnSpeed', 0);
      if (speed > 0) {
        const f = vec3();
        angleVectors(dir, f);
        for (const e of created) {
          const b = this.sp.bodiesByEntity.get(e.id);
          if (b) b.setVelocity({ x: f.x * speed, y: f.y * speed, z: f.z * speed });
        }
      }
      for (const e of created) this.fireOutput('OnEntitySpawned', e);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** SDK: CPointTeleport — moves `target` to this entity. */
export class PointTeleport extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'teleport') {
      for (const t of this.sp.findAllByName(this.kvString('target'), this, activator, caller)) {
        this.sp.teleportEntity(t, this.origin, this.angles, vec3());
        if (t === this.sp.player) this.sp.portals.resetPlayerTracking();
      }
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** point_clientcommand: console commands for the client (the host decides what to honour). */
export class PointClientCommand extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'command') {
      this.sp.emit({ type: 'clientcommand', command: value });
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** Accepts any input and does nothing (AI relationships, achievements, navigation, speech filters…). */
export class InertLogic extends SpEntity {
  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (super.acceptInput(input, value, activator, caller)) return true;
    const ach = input.toLowerCase() === 'fireevent' && this.classname === 'logic_achievement';
    if (ach) this.fireOutput('OnFired', activator);
    return true;
  }
}

// ─── Paths ──────────────────────────────────────────────────────────────────

/** path_corner: a waypoint for func_train and walking actors (OnPass when reached). */
export class PathCorner extends SpEntity {
  nextName = '';

  override spawn(): void {
    super.spawn();
    this.nextName = this.kvString('target');
  }

  next(): Entity | null {
    return this.nextName ? this.sp.findByName(this.nextName) : null;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'setnextpathcorner') {
      this.nextName = value;
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

/** path_track: a node of a func_tracktrain's path. SDK: CPathTrack. */
export class PathTrack extends SpEntity {
  nextName = '';
  altName = '';
  useAlt = false;
  disabled = false;
  prev: PathTrack | null = null;

  override spawn(): void {
    super.spawn();
    this.nextName = this.kvString('target');
    this.altName = this.kvString('altpath');
    this.disabled = (this.spawnflags & 1) !== 0;
  }

  override activate(): void {
    super.activate();
    const n = this.nextRaw();
    if (n) n.prev = this;
  }

  private nextRaw(): PathTrack | null {
    const e = this.nextName ? this.sp.findByName(this.nextName) : null;
    return e instanceof PathTrack ? e : null;
  }

  /** SDK: CPathTrack::GetNext — the alternate path when switched; null past a disabled node. */
  next(): PathTrack | null {
    if (this.disabled) return null;
    const name = this.useAlt && this.altName ? this.altName : this.nextName;
    const e = name ? this.sp.findByName(name) : null;
    return e instanceof PathTrack ? e : null;
  }

  previous(): PathTrack | null {
    if (this.prev && !this.prev.removed) return this.prev.disabled ? null : this.prev;
    let found: PathTrack | null = null;
    this.sp.forEachEntity((e) => {
      if (!found && e instanceof PathTrack && e.next() === this) found = e;
    });
    return found;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enablepath':
        this.disabled = false;
        return true;
      case 'disablepath':
        this.disabled = true;
        return true;
      case 'togglepath':
        this.disabled = !this.disabled;
        return true;
      case 'enablealternatepath':
        this.useAlt = true;
        return true;
      case 'disablealternatepath':
        this.useAlt = false;
        return true;
      case 'togglealternatepath':
        this.useAlt = !this.useAlt;
        return true;
      case 'inpass':
        this.fireOutput('OnPass', activator);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(SpLogicAuto, 'logic_auto');
registerSp(LogicRelay, 'logic_relay');
registerSp(LogicTimer, 'logic_timer');
registerSp(LogicCase, 'logic_case');
registerSp(LogicBranch, 'logic_branch');
registerSp(MathCounter, 'math_counter');
registerSp(MathRemap, 'math_remap');
registerSp(EnvGlobal, 'env_global');
registerSp(LogicAutosave, 'logic_autosave');
registerSp(PointTemplate, 'point_template');
registerSp(EnvEntityMaker, 'env_entity_maker');
registerSp(PointTeleport, 'point_teleport');
registerSp(PointClientCommand, 'point_clientcommand');
registerSp(PathCorner, 'path_corner');
registerSp(PathTrack, 'path_track');
registerSp(FilterName, 'filter_activator_name');
registerSp(FilterClass, 'filter_activator_class');
registerSp(FilterMulti, 'filter_multi');
registerSp(
  InertLogic,
  'ai_relationship',
  'ai_speechfilter',
  'logic_achievement',
  'logic_navigation',
  'logic_collision_pair',
  'env_microphone',
  'env_speaker',
  'shadow_control',
  'func_areaportal',
  'func_occluder',
  'info_overlay_accessor',
  'water_lod_control',
  'info_lighting_relative',
);
registerSp(PointEntity, 'info_landmark', 'info_target', 'info_teleport_destination', 'info_player_start', 'info_hint', 'info_npc_spawn_destination');

export { copy };
