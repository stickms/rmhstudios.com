// ============================================================
// BREAKPOINT — World engine
// Authoritative-ish local simulation: movement, combat, abilities,
// round/MR13 state machine, economy, spike. Bots fill both teams.
// Designed to be ticked once per animation frame with a clamped dt.
// ============================================================
import type {
  Actor, Vec3, Team, RoundPhase, MatchSnapshot, WorldFx, Tracer,
  KillFeedEntry, SpikeState, RoundResult, LoadoutState,
} from '../types';
import type { MatchConfig } from '../store';
import { getAgent } from '../agents';
import { getWeapon } from '../weapons';
import {
  ATTACKER_SPAWNS, DEFENDER_SPAWNS, SITES, SITE_LIST,
} from '../map';
import {
  resolveHorizontal, groundHeightAt, raycastBoxes, rayCapsule, raySphere,
  dist2D, hasLineOfSight, setDynamicBoxes, setSmokes,
} from './collision';
import { botThink, makeBrain, type BotWorld } from './bots';
import {
  TICK_DT, GRAVITY, JUMP_VELOCITY, ACCEL, FRICTION, WALK_SPEED, RUN_SPEED, CROUCH_SPEED,
  EYE_HEIGHT, CROUCH_EYE_HEIGHT, PLAYER_RADIUS, HEAD_HEIGHT, HEAD_RADIUS, PLAYER_HEIGHT,
  BUY_TIME, ROUND_TIME, SPIKE_TIME, PLANT_TIME, DEFUSE_TIME, ROUND_END_TIME,
  ROUNDS_TO_WIN, HALF_ROUNDS, START_CREDITS, MAX_CREDITS, KILL_REWARD, WIN_REWARD,
  PLANT_REWARD, LOSS_BONUS,
} from '../constants';

export interface LocalInput {
  moveX: number;   // -1..1 strafe (right +)
  moveZ: number;   // -1..1 forward (+ forward)
  jump: boolean;
  crouch: boolean;
  run: boolean;
  yaw: number;     // absolute look (set by mouse/touch)
  pitch: number;
  firing: boolean;
  ads: boolean;
  reloadEdge: boolean;
  abilityEdge: 'C' | 'Q' | 'E' | 'X' | null;
  switchEdge: 'primary' | 'sidearm' | 'knife' | null;
  plant: boolean;
  defuse: boolean;
}

export function freshInput(): LocalInput {
  return {
    moveX: 0, moveZ: 0, jump: false, crouch: false, run: false,
    yaw: 0, pitch: 0, firing: false, ads: false, reloadEdge: false,
    abilityEdge: null, switchEdge: null, plant: false, defuse: false,
  };
}

let TRACER_ID = 1;
let FX_ID = 1;
let KF_ID = 1;

function v(x = 0, y = 0, z = 0): Vec3 { return { x, y, z }; }

export class World {
  config: MatchConfig;
  actors: Actor[] = [];
  fx: WorldFx[] = [];
  tracers: Tracer[] = [];
  killFeed: KillFeedEntry[] = [];

  phase: RoundPhase = 'buy';
  round = 1;
  scoreAttackers = 0;
  scoreDefenders = 0;
  /** which team is attacking THIS round (sides swap at the half). */
  attackersTeam: Team = 'attackers';
  phaseEndsAt = 0;
  spike: SpikeState = { carrierId: null, planted: false, pos: null, plantedAt: 0, defusing: false, planting: false, progress: 0 };
  lastResult: RoundResult | null = null;
  over = false;
  winner: Team | null = null;
  lossStreak: Record<Team, number> = { attackers: 0, defenders: 0 };

  input: LocalInput = freshInput();
  now = 0;

  // notifications for UI sounds/popups
  onKill?: (e: KillFeedEntry) => void;
  onRoundEnd?: (r: RoundResult) => void;
  onMatchEnd?: (winner: Team) => void;

  private dynamicWalls: { box: import('../map').Box; endsAt: number }[] = [];

  constructor(config: MatchConfig) {
    this.config = config;
    this.localTeam = config.localTeam;
    this.attackersTeam = config.localTeam; // round 1 local team attacks
    this.spawnActors();
    this.startBuyPhase();
  }

  localTeam: Team;

  get local(): Actor | undefined { return this.actors.find((a) => a.isLocal); }

  /** Live deployable-wall boxes (for the renderer). */
  get wallBoxes(): import('../map').Box[] { return this.dynamicWalls.map((d) => d.box); }

  // ── Setup ─────────────────────────────────────────────────
  private spawnActors() {
    const { config } = this;
    const localTeam = config.localTeam;
    const enemyTeam: Team = localTeam === 'attackers' ? 'defenders' : 'attackers';

    this.actors = [];
    // local player
    this.actors.push(this.makeActor('local', config.allies.length ? 'You' : 'You', 'human', localTeam, config.localAgentId, true));
    // allies
    config.allies.forEach((al, i) => {
      this.actors.push(this.makeActor(`ally${i}`, al.name, 'bot', localTeam, al.agentId, false));
    });
    // enemies
    config.enemies.forEach((en, i) => {
      this.actors.push(this.makeActor(`enemy${i}`, en.name, 'bot', enemyTeam, en.agentId, false));
    });
  }

  private makeActor(id: string, name: string, kind: 'human' | 'bot', team: Team, agentId: string, isLocal: boolean): Actor {
    const agent = getAgent(agentId);
    const hpBonus = agent.passive?.hpBonus ?? 0;
    return {
      id, name, kind, team, agentId, isLocal,
      pos: v(), vel: v(), yaw: 0, pitch: 0, onGround: true, crouch: false,
      hp: 100 + hpBonus, maxHp: 100 + hpBonus, armor: 0, alive: true,
      credits: START_CREDITS,
      loadout: { primary: null, sidearm: 'classic', armor: 0, abilities: {} },
      currentWeapon: 'classic', ammo: getWeapon('classic').magazine, reserve: getWeapon('classic').reserve,
      reloading: false, reloadEnd: 0, lastShot: 0, recoil: 0,
      abilityCharges: {}, ultPoints: 0, blindUntil: 0, healUntil: 0, shieldHp: 0,
      revealedUntil: 0, speedBoostUntil: 0, hasSpike: false,
      brain: kind === 'bot' ? makeBrain(this.config.botDifficulty) : undefined,
      kills: 0, deaths: 0, assists: 0, score: 0,
      anim: { moveSpeed: 0, firing: 0, casting: 0, hitFlash: 0, deathTime: 0 },
    };
  }

  // ── Round lifecycle ───────────────────────────────────────
  private startBuyPhase() {
    this.phase = 'buy';
    this.phaseEndsAt = this.now + BUY_TIME * 1000;
    this.spike = { carrierId: null, planted: false, pos: null, plantedAt: 0, defusing: false, planting: false, progress: 0 };
    this.fx = [];
    this.dynamicWalls = [];
    setDynamicBoxes([]);
    setSmokes([]);

    // reset combat state, respawn at spawn points
    const att = this.actors.filter((a) => a.team === this.attackersTeam);
    const def = this.actors.filter((a) => a.team !== this.attackersTeam);
    att.forEach((a, i) => this.respawn(a, ATTACKER_SPAWNS[i % ATTACKER_SPAWNS.length], false));
    def.forEach((a, i) => this.respawn(a, DEFENDER_SPAWNS[i % DEFENDER_SPAWNS.length], true));

    // give the spike to one attacker
    const carrier = att.find((a) => a.isLocal) ?? att[0];
    if (carrier) { carrier.hasSpike = true; this.spike.carrierId = carrier.id; }

    // bots auto-buy
    for (const a of this.actors) if (a.kind === 'bot') this.botBuy(a);
  }

  private respawn(a: Actor, spawn: Vec3, facePos: boolean) {
    a.pos = v(spawn.x, 0, spawn.z);
    a.vel = v();
    a.alive = true;
    a.crouch = false;
    a.hp = a.maxHp;
    a.shieldHp = 0;
    a.armor = a.loadout.armor;
    a.blindUntil = 0; a.healUntil = 0; a.revealedUntil = 0; a.speedBoostUntil = 0;
    a.reloading = false; a.recoil = 0;
    // face toward map centre
    a.yaw = Math.atan2(-a.pos.x, a.pos.z) + (facePos ? 0 : 0);
    a.pitch = 0;
    // equip best weapon from loadout
    this.equip(a, a.loadout.primary ?? a.loadout.sidearm);
    // restore ability charges from loadout
    a.abilityCharges = { ...a.loadout.abilities };
    a.anim.deathTime = 0;
    a.hasSpike = false;
  }

  private startAction() {
    this.phase = 'action';
    this.phaseEndsAt = this.now + ROUND_TIME * 1000;
  }

  // ── Buying ────────────────────────────────────────────────
  canBuy(): boolean { return this.phase === 'buy'; }

  buyWeapon(a: Actor, weaponId: string): boolean {
    if (!this.canBuy() || !a.alive) return false;
    const w = getWeapon(weaponId);
    if (a.credits < w.cost) return false;
    // refund nothing; replace primary
    a.credits -= w.cost;
    if (w.class === 'sidearm') { a.loadout.sidearm = weaponId; }
    else { a.loadout.primary = weaponId; }
    this.equip(a, weaponId);
    return true;
  }

  buyArmor(a: Actor, value: number, cost: number): boolean {
    if (!this.canBuy() || !a.alive || a.loadout.armor >= value) return false;
    if (a.credits < cost) return false;
    a.credits -= cost;
    a.loadout.armor = value;
    a.armor = value;
    return true;
  }

  buyAbility(a: Actor, abilityId: string, cost: number, max: number): boolean {
    if (!this.canBuy() || !a.alive) return false;
    const have = a.loadout.abilities[abilityId] ?? 0;
    if (have >= max) return false;
    if (a.credits < cost) return false;
    a.credits -= cost;
    a.loadout.abilities[abilityId] = have + 1;
    a.abilityCharges[abilityId] = (a.abilityCharges[abilityId] ?? 0) + 1;
    return true;
  }

  private botBuy(a: Actor) {
    const agent = getAgent(a.agentId);
    // simple economy: full buy if affordable, else eco
    const wishRifle = a.credits >= 3900;
    if (wishRifle) {
      const rifle = Math.random() < 0.5 ? 'vandal' : 'phantom';
      this.buyWeapon(a, rifle);
      this.buyArmor(a, 50, 1000);
    } else if (a.credits >= 2000) {
      this.buyWeapon(a, 'spectre');
      this.buyArmor(a, 50, 1000);
    } else if (a.credits >= 900) {
      this.buyWeapon(a, 'sheriff');
      this.buyArmor(a, 25, 400);
    }
    // buy a couple abilities
    for (const ab of agent.abilities) {
      if (ab.slot === 'X' || ab.cost === 0) continue;
      this.buyAbility(a, ab.id, ab.cost, ab.charges);
    }
  }

  equip(a: Actor, weaponId: string) {
    const w = getWeapon(weaponId);
    a.currentWeapon = weaponId;
    a.ammo = w.magazine;
    a.reserve = w.reserve;
    a.reloading = false;
  }

  switchTo(a: Actor, slot: 'primary' | 'sidearm' | 'knife') {
    if (!a.alive) return;
    if (slot === 'knife') { this.equip(a, 'knife'); return; }
    if (slot === 'primary' && a.loadout.primary) { this.equip(a, a.loadout.primary); return; }
    if (slot === 'sidearm') { this.equip(a, a.loadout.sidearm); }
  }

  // ── Main tick ─────────────────────────────────────────────
  update(dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    this._lastDt = dt;
    this.now += dtMs;

    // expire dynamic walls / fx
    this.dynamicWalls = this.dynamicWalls.filter((d) => d.endsAt > this.now);
    setDynamicBoxes(this.dynamicWalls.map((d) => d.box));
    this.fx = this.fx.filter((f) => f.endsAt > this.now);
    setSmokes(this.fx.filter((f) => f.kind === 'smoke').map((f) => ({ x: f.pos.x, y: f.pos.y + 1.2, z: f.pos.z, r: f.radius })));
    this.tracers = this.tracers.filter((t) => this.now - t.bornAt < 90);
    this.killFeed = this.killFeed.filter((k) => this.now - k.at < 6000);

    // phase timers
    this.tickPhase(dt);

    // ability damage zones (mollies)
    this.tickHazards(dt);

    // local player
    const local = this.local;
    if (local && local.alive && this.phase !== 'roundEnd') {
      this.applyLocalInput(local, dt);
    } else if (local) {
      // dead/freeze — settle physics only
      this.integrate(local, dt, 0, 0, false, false, false);
    }

    // bots
    for (const a of this.actors) {
      if (a === local) continue;
      this.tickBot(a, dt);
    }

    // regen heals
    for (const a of this.actors) {
      if (a.alive && a.healUntil > this.now && a.hp < a.maxHp) {
        a.hp = Math.min(a.maxHp, a.hp + 12 * dt);
      }
    }
  }

  private tickPhase(dt: number) {
    void dt;
    if (this.over) return;
    if (this.phase === 'buy') {
      if (this.now >= this.phaseEndsAt) this.startAction();
    } else if (this.phase === 'action') {
      this.tickSpikeInteractions();
      if (this.now >= this.phaseEndsAt) {
        // time expired: defenders win (attackers failed to plant)
        this.endRound(this.attackersTeam === 'attackers' ? 'defenders' : 'attackers', 'time');
        return;
      }
      this.checkElimination();
    } else if (this.phase === 'planted') {
      this.tickSpikeInteractions();
      if (this.spike.planted && this.now >= this.spike.plantedAt + SPIKE_TIME * 1000) {
        // spike detonates → attackers win
        this.endRound(this.attackersTeam, 'spike');
        return;
      }
      this.checkElimination();
    } else if (this.phase === 'roundEnd') {
      if (this.now >= this.phaseEndsAt) this.nextRound();
    }
  }

  private checkElimination() {
    const attAlive = this.actors.some((a) => a.team === this.attackersTeam && a.alive);
    const defAlive = this.actors.some((a) => a.team !== this.attackersTeam && a.alive);
    if (!defAlive && this.phase !== 'planted') {
      this.endRound(this.attackersTeam, 'elimination'); return;
    }
    if (!attAlive) {
      // attackers dead — if spike planted, it still ticks to detonation, defenders must defuse
      if (this.spike.planted) return;
      this.endRound(this.attackersTeam === 'attackers' ? 'defenders' : 'attackers', 'elimination');
    }
  }

  private defendersTeam(): Team { return this.attackersTeam === 'attackers' ? 'defenders' : 'attackers'; }

  private endRound(winner: Team, reason: RoundResult['reason']) {
    if (this.phase === 'roundEnd' || this.over) return;
    this.phase = 'roundEnd';
    this.phaseEndsAt = this.now + ROUND_END_TIME * 1000;
    const result: RoundResult = { round: this.round, winner, reason };
    this.lastResult = result;

    if (winner === 'attackers') this.scoreAttackers++; else this.scoreDefenders++;

    // economy
    const loser = winner === 'attackers' ? 'defenders' : 'attackers';
    this.lossStreak[winner] = 0;
    this.lossStreak[loser] = Math.min(2, this.lossStreak[loser] + 1);
    for (const a of this.actors) {
      if (!a) continue;
      if (a.team === winner) a.credits = Math.min(MAX_CREDITS, a.credits + WIN_REWARD);
      else a.credits = Math.min(MAX_CREDITS, a.credits + LOSS_BONUS[this.lossStreak[loser]]);
      // plant reward to attackers regardless
      if (a.team === this.attackersTeam && this.spike.planted) a.credits = Math.min(MAX_CREDITS, a.credits + PLANT_REWARD);
    }

    this.onRoundEnd?.(result);

    // match end?
    if (this.scoreAttackers >= ROUNDS_TO_WIN || this.scoreDefenders >= ROUNDS_TO_WIN) {
      this.over = true;
      this.winner = this.scoreAttackers >= ROUNDS_TO_WIN ? 'attackers' : 'defenders';
      this.onMatchEnd?.(this.winner);
    }
  }

  private nextRound() {
    this.round++;
    // swap sides at the half
    if (this.round === HALF_ROUNDS + 1) {
      this.attackersTeam = this.attackersTeam === 'attackers' ? 'defenders' : 'attackers';
    }
    this.startBuyPhase();
  }

  // ── Local input → movement / actions ──────────────────────
  private applyLocalInput(a: Actor, dt: number) {
    const inp = this.input;
    a.yaw = inp.yaw;
    a.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    a.crouch = inp.crouch;

    // movement vector in world space from local frame
    const move = this.localToWorld(a.yaw, inp.moveX, inp.moveZ);
    this.integrate(a, dt, move.x, move.z, inp.jump, inp.crouch, inp.run);

    // weapon switching
    if (inp.switchEdge) { this.switchTo(a, inp.switchEdge); inp.switchEdge = null; }

    // reload
    if (inp.reloadEdge) { this.beginReload(a); inp.reloadEdge = false; }
    this.tickReload(a);

    // ability
    if (inp.abilityEdge) { this.castAbility(a, inp.abilityEdge); inp.abilityEdge = null; }

    // fire
    if (inp.firing && this.phase !== 'buy') this.tryFire(a);
  }

  private localToWorld(yaw: number, strafe: number, forward: number): Vec3 {
    // forward (+) = look direction on XZ; yaw 0 faces -Z
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const sx = Math.cos(yaw), sz = Math.sin(yaw);
    return { x: fx * forward + sx * strafe, y: 0, z: fz * forward + sz * strafe };
  }

  private integrate(a: Actor, dt: number, wishX: number, wishZ: number, jump: boolean, crouch: boolean, run: boolean) {
    const agent = getAgent(a.agentId);
    let max = crouch ? CROUCH_SPEED : (run ? RUN_SPEED : WALK_SPEED);
    max *= agent.passive?.moveMul ?? 1;
    if (a.speedBoostUntil > this.now) max *= 1.35;
    if (a.hasSpike) max *= 0.97;

    const wishLen = Math.hypot(wishX, wishZ);
    let wx = 0, wz = 0;
    if (wishLen > 0.001) { wx = wishX / wishLen; wz = wishZ / wishLen; }

    // horizontal accel toward wish
    const targetVx = wx * max, targetVz = wz * max;
    if (wishLen > 0.001) {
      a.vel.x += (targetVx - a.vel.x) * Math.min(1, ACCEL * dt / Math.max(1, max));
      a.vel.z += (targetVz - a.vel.z) * Math.min(1, ACCEL * dt / Math.max(1, max));
    } else {
      const fr = Math.max(0, 1 - FRICTION * dt / Math.max(1, max));
      a.vel.x *= fr; a.vel.z *= fr;
    }

    // gravity + jump
    if (a.onGround && jump) { a.vel.y = JUMP_VELOCITY; a.onGround = false; }
    a.vel.y -= GRAVITY * dt;

    // integrate
    a.pos.x += a.vel.x * dt;
    a.pos.z += a.vel.z * dt;
    a.pos.y += a.vel.y * dt;

    resolveHorizontal(a.pos, PLAYER_RADIUS);

    // vertical: rest on ground/box tops
    const floor = groundHeightAt(a.pos.x, a.pos.z, PLAYER_RADIUS);
    if (a.pos.y <= floor + 0.001) {
      a.pos.y = floor;
      if (a.vel.y < 0) a.vel.y = 0;
      a.onGround = true;
    } else {
      a.onGround = false;
    }

    // anim hint
    const speed = Math.hypot(a.vel.x, a.vel.z);
    a.anim.moveSpeed = Math.min(1, speed / RUN_SPEED);
    // recoil recovery
    a.recoil = Math.max(0, a.recoil - dt * 6);
  }

  // ── Bots ──────────────────────────────────────────────────
  private tickBot(a: Actor, dt: number) {
    if (!a.alive) { this.integrate(a, dt, 0, 0, false, false, false); return; }
    if (this.phase === 'roundEnd') { this.integrate(a, dt, 0, 0, false, false, false); return; }
    if (this.phase === 'buy') {
      // hold in spawn during buy; tiny idle settle
      this.integrate(a, dt, 0, 0, false, false, false);
      return;
    }
    const bw: BotWorld = {
      now: this.now,
      actors: this.actors,
      spikePlanted: this.spike.planted,
      spikePos: this.spike.pos,
      localTeamAttacking: this.attackersTeam === this.localTeam,
      attackersTeam: this.attackersTeam,
    };
    const intent = botThink(a, bw, this.config.botDifficulty);
    a.yaw += this.angleLerp(a.yaw, intent.wantYaw, dt * (4 + this.config.botDifficulty * 6));
    a.pitch += (intent.wantPitch - a.pitch) * Math.min(1, dt * 8);
    a.crouch = intent.crouch;
    this.integrate(a, dt, intent.moveX, intent.moveZ, false, intent.crouch, true);

    this.tickReload(a);
    if (a.ammo === 0 && !a.reloading) this.beginReload(a);

    if (intent.fire) this.tryFire(a);

    // bots use abilities occasionally during action
    if (this.phase === 'action' && Math.random() < 0.002) this.botUseAbility(a);

    // plant / defuse
    if (intent.wantPlant) this.handlePlant(a, dt);
    if (intent.wantDefuse) this.handleDefuse(a, dt);
  }

  private angleLerp(from: number, to: number, t: number): number {
    let diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return diff * Math.min(1, t);
  }

  // ── Reload ────────────────────────────────────────────────
  beginReload(a: Actor) {
    const w = getWeapon(a.currentWeapon);
    if (a.reloading || a.ammo >= w.magazine || a.reserve <= 0 || w.class === 'melee') return;
    a.reloading = true;
    a.reloadEnd = this.now + w.reloadTime * 1000;
  }
  private tickReload(a: Actor) {
    if (!a.reloading) return;
    if (this.now >= a.reloadEnd) {
      const w = getWeapon(a.currentWeapon);
      const need = w.magazine - a.ammo;
      const take = Math.min(need, a.reserve);
      a.ammo += take; a.reserve -= take;
      a.reloading = false;
    }
  }

  // ── Firing / combat ───────────────────────────────────────
  tryFire(a: Actor): boolean {
    if (!a.alive || a.reloading || a.blindUntil > this.now) return false;
    const w = getWeapon(a.currentWeapon);
    const interval = 1000 / w.fireRate;
    if (this.now - a.lastShot < interval) return false;
    if (w.class !== 'melee' && a.ammo <= 0) { this.beginReload(a); return false; }

    a.lastShot = this.now;
    if (w.class !== 'melee') a.ammo--;
    a.anim.firing = this.now;
    a.recoil = Math.min(1.4, a.recoil + (w.class === 'sniper' ? 0.9 : 0.18));

    const moving = Math.hypot(a.vel.x, a.vel.z) > 0.6;
    const adsBonus = (a.isLocal && this.input.ads) ? 0.35 : 1;
    let spread = (w.spread + (moving ? w.spreadMoving : 0) + a.recoil * 0.02) * adsBonus;
    if (a.crouch) spread *= 0.6;

    const pellets = w.pellets ?? 1;
    for (let p = 0; p < pellets; p++) {
      this.fireRay(a, w, spread);
    }
    return true;
  }

  private fireRay(a: Actor, w: ReturnType<typeof getWeapon>, spread: number) {
    const origin = v(a.pos.x, a.pos.y + (a.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), a.pos.z);
    // direction from yaw/pitch + spread
    const yaw = a.yaw + (Math.random() - 0.5) * spread * 2;
    const pitch = a.pitch + (Math.random() - 0.5) * spread * 2;
    const dir = v(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const maxT = w.range;

    const wallHit = raycastBoxes(origin, dir, maxT);
    const wallT = wallHit ? wallHit.t : maxT;

    // find nearest enemy hit before wall
    let bestT = wallT;
    let victim: Actor | null = null;
    let headshot = false;
    for (const t of this.actors) {
      if (!t.alive || t.team === a.team || t === a) continue;
      const base = v(t.pos.x, t.pos.y, t.pos.z);
      // head sphere
      const headC = v(t.pos.x, t.pos.y + (t.crouch ? HEAD_HEIGHT - 0.55 : HEAD_HEIGHT), t.pos.z);
      const th = raySphere(origin, dir, headC, HEAD_RADIUS, bestT);
      if (th !== null && th < bestT) { bestT = th; victim = t; headshot = true; }
      // body capsule
      const bh = rayCapsule(origin, dir, base, t.crouch ? PLAYER_HEIGHT * 0.62 : PLAYER_HEIGHT, PLAYER_RADIUS, bestT);
      if (bh !== null && bh < bestT) { bestT = bh; victim = t; headshot = false; }
    }

    const end = v(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    this.tracers.push({ id: TRACER_ID++, from: origin, to: end, bornAt: this.now, team: a.team, hit: !!victim });

    if (victim) {
      let dmg = headshot ? w.damageHead : w.damageBody;
      // simple legshot chance from low pitch hits handled as body; melee always body
      this.applyDamage(victim, a, dmg, headshot, w.name);
    }
  }

  private applyDamage(victim: Actor, attacker: Actor, dmg: number, headshot: boolean, weapon: string) {
    if (!victim.alive) return;
    victim.anim.hitFlash = this.now;
    // armor absorbs a portion
    if (victim.shieldHp > 0) {
      const a = Math.min(victim.shieldHp, dmg * 0.5);
      victim.shieldHp -= a; dmg -= a;
    }
    if (victim.armor > 0 && dmg > 0) {
      const absorbed = Math.min(victim.armor, dmg * 0.5);
      victim.armor -= absorbed;
      dmg -= absorbed;
    }
    victim.hp -= dmg;
    if (victim.hp <= 0) {
      victim.hp = 0;
      this.kill(victim, attacker, headshot, weapon);
    }
  }

  private kill(victim: Actor, killer: Actor, headshot: boolean, weapon: string) {
    victim.alive = false;
    victim.deaths++;
    victim.anim.deathTime = this.now;
    victim.vel = v();
    // drop spike
    if (victim.hasSpike) {
      victim.hasSpike = false;
      // nearest attacker picks up implicitly via carrier reassignment
      const carrier = this.actors.find((x) => x.alive && x.team === this.attackersTeam);
      if (carrier && !this.spike.planted) { carrier.hasSpike = true; this.spike.carrierId = carrier.id; }
    }
    if (killer && killer !== victim && killer.team !== victim.team) {
      killer.kills++;
      killer.score += headshot ? 250 : 200;
      killer.credits = Math.min(MAX_CREDITS, killer.credits + KILL_REWARD);
      killer.ultPoints = Math.min(10, killer.ultPoints + 1);
    }
    const entry: KillFeedEntry = {
      id: KF_ID++, killer: killer?.name ?? 'world', victim: victim.name, weapon,
      headshot, killerTeam: killer?.team ?? victim.team, victimTeam: victim.team, at: this.now,
    };
    this.killFeed.unshift(entry);
    this.onKill?.(entry);
  }

  // ── Spike ─────────────────────────────────────────────────
  private tickSpikeInteractions() {
    const local = this.local;
    if (!local || !local.alive) { if (this.local) { this.spike.planting = false; this.spike.defusing = false; } return; }
    const attacking = local.team === this.attackersTeam;
    if (attacking && !this.spike.planted && local.hasSpike && this.input.plant && this.onSite(local)) {
      this.handlePlant(local, this.lastDt());
    } else if (!attacking && this.spike.planted && this.input.defuse && this.spike.pos && dist2D(local.pos, this.spike.pos) < 2) {
      this.handleDefuse(local, this.lastDt());
    } else {
      // decay local progress if not actively planting/defusing
      if (this.spike.planting || this.spike.defusing) {
        this.spike.progress = Math.max(0, this.spike.progress - this.lastDt() * 0.5);
        if (this.spike.progress <= 0) { this.spike.planting = false; this.spike.defusing = false; }
      }
    }
  }

  private _lastDt = TICK_DT;
  private lastDt() { return this._lastDt; }

  private onSite(a: Actor): boolean {
    return SITE_LIST.some((s) => dist2D(a.pos, s) < s.r);
  }

  private handlePlant(a: Actor, dt: number) {
    if (this.spike.planted || !a.hasSpike) return;
    if (!this.onSite(a)) return;
    this._lastDt = dt;
    this.spike.planting = true; this.spike.defusing = false;
    this.spike.progress = Math.min(1, this.spike.progress + dt / PLANT_TIME);
    if (this.spike.progress >= 1) {
      this.spike.planted = true;
      this.spike.planting = false;
      this.spike.pos = v(a.pos.x, 0, a.pos.z);
      this.spike.plantedAt = this.now;
      this.spike.progress = 0;
      a.hasSpike = false;
      a.ultPoints = Math.min(10, a.ultPoints + 1);
      this.phase = 'planted';
      this.phaseEndsAt = this.now + SPIKE_TIME * 1000;
    }
  }

  private handleDefuse(a: Actor, dt: number) {
    if (!this.spike.planted || !this.spike.pos) return;
    if (dist2D(a.pos, this.spike.pos) > 2) return;
    this._lastDt = dt;
    this.spike.defusing = true; this.spike.planting = false;
    this.spike.progress = Math.min(1, this.spike.progress + dt / DEFUSE_TIME);
    if (this.spike.progress >= 1) {
      this.spike.defusing = false;
      this.endRound(this.defendersTeam(), 'defuse');
    }
  }

  // ── Abilities ─────────────────────────────────────────────
  castAbility(a: Actor, slot: 'C' | 'Q' | 'E' | 'X') {
    if (!a.alive || this.phase === 'buy') return;
    const agent = getAgent(a.agentId);
    const ab = agent.abilities.find((x) => x.slot === slot);
    if (!ab) return;
    if (slot === 'X') {
      if (a.ultPoints < (ab.ultPoints ?? 8)) return;
      a.ultPoints = 0;
    } else {
      const have = a.abilityCharges[ab.id] ?? 0;
      if (have <= 0) return;
      a.abilityCharges[ab.id] = have - 1;
    }
    a.anim.casting = this.now;
    this.executeAbility(a, ab.kind, ab.id, slot === 'X');
  }

  private botUseAbility(a: Actor) {
    const agent = getAgent(a.agentId);
    for (const ab of agent.abilities) {
      if (ab.slot === 'X') { if (a.ultPoints >= (ab.ultPoints ?? 8)) { this.castAbility(a, 'X'); return; } continue; }
      if ((a.abilityCharges[ab.id] ?? 0) > 0) { this.castAbility(a, ab.slot); return; }
    }
  }

  private forward(a: Actor, dist: number): Vec3 {
    return v(a.pos.x + Math.sin(a.yaw) * dist, a.pos.y, a.pos.z - Math.cos(a.yaw) * dist);
  }

  private executeAbility(a: Actor, kind: import('../types').AbilityKind, id: string, ult: boolean) {
    const now = this.now;
    switch (kind) {
      case 'dash': {
        const power = ult ? 11 : 9;
        a.vel.x = Math.sin(a.yaw) * power;
        a.vel.z = -Math.cos(a.yaw) * power;
        a.vel.y = 2.4;
        a.onGround = false;
        break;
      }
      case 'heal': {
        a.healUntil = now + (ult ? 3000 : 4000);
        if (ult) { a.hp = a.maxHp; a.shieldHp = 50; }
        break;
      }
      case 'shield': {
        a.shieldHp = Math.max(a.shieldHp, ult ? 75 : 50);
        if (ult) a.speedBoostUntil = now + 6000;
        break;
      }
      case 'smoke': {
        const p = this.forward(a, 8);
        const floor = groundHeightAt(p.x, p.z);
        this.fx.push({ id: `fx${FX_ID++}`, kind: 'smoke', team: a.team, pos: v(p.x, floor, p.z), radius: 4, endsAt: now + 12000, ownerId: a.id });
        break;
      }
      case 'wall': {
        const p = this.forward(a, 4);
        const box = { cx: p.x, cy: 1.2, cz: p.z, hx: Math.abs(Math.cos(a.yaw)) * 3 + 0.4, hy: 1.2, hz: Math.abs(Math.sin(a.yaw)) * 3 + 0.4, color: a.team === 'attackers' ? '#ff4655' : '#16e0a3', solid: true };
        this.dynamicWalls.push({ box, endsAt: now + 12000 });
        this.fx.push({ id: `fx${FX_ID++}`, kind: 'wall', team: a.team, pos: v(p.x, 0, p.z), radius: 3, endsAt: now + 12000, ownerId: a.id });
        break;
      }
      case 'flash': {
        const p = this.forward(a, ult ? 6 : 10);
        this.fx.push({ id: `fx${FX_ID++}`, kind: 'flash', team: a.team, pos: v(p.x, 1.4, p.z), radius: ult ? 40 : 16, endsAt: now + 400, ownerId: a.id });
        // blind enemies (and ult blinds wider) who can see the flash point
        for (const t of this.actors) {
          if (!t.alive) continue;
          if (t.team === a.team && !ult) continue;
          if (ult && t.team === a.team) continue;
          const d = dist2D(t.pos, p);
          if (d > (ult ? 40 : 18)) continue;
          const eye = v(t.pos.x, t.pos.y + 1.5, t.pos.z);
          if (!hasLineOfSight(eye, v(p.x, p.y, p.z))) continue;
          // facing toward flash?
          const ang = Math.atan2(p.x - t.pos.x, -(p.z - t.pos.z));
          const diff = Math.abs(((ang - t.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          const dur = diff < 1.0 ? 1800 : diff < 1.8 ? 900 : 300;
          t.blindUntil = Math.max(t.blindUntil, now + dur);
        }
        break;
      }
      case 'recon': {
        const radius = ult ? 999 : 18;
        const p = ult ? a.pos : this.forward(a, 10);
        if (!ult) this.fx.push({ id: `fx${FX_ID++}`, kind: 'recon', team: a.team, pos: v(p.x, 1, p.z), radius: 18, endsAt: now + 4000, ownerId: a.id });
        for (const t of this.actors) {
          if (!t.alive || t.team === a.team) continue;
          if (dist2D(t.pos, p) <= radius) t.revealedUntil = now + (ult ? 4000 : 3000);
        }
        break;
      }
      case 'molly': {
        const p = this.forward(a, ult ? 0 : 9);
        const floor = groundHeightAt(p.x, p.z);
        this.fx.push({ id: `fx${FX_ID++}`, kind: 'molly', team: a.team, pos: v(p.x, floor, p.z), radius: ult ? 9 : 3.5, endsAt: now + (ult ? 3000 : 5000), ownerId: a.id });
        break;
      }
    }
  }

  private tickHazards(dt: number) {
    this._lastDt = dt;
    for (const f of this.fx) {
      if (f.kind !== 'molly') continue;
      for (const t of this.actors) {
        if (!t.alive || t.team === f.team) continue;
        if (dist2D(t.pos, f.pos) <= f.radius && Math.abs(t.pos.y - f.pos.y) < 2.5) {
          this.applyDamage(t, this.actors.find((x) => x.id === f.ownerId)!, 30 * dt, false, 'Hazard');
        }
      }
      // also damage local if applicable handled above (team check)
    }
  }

  // ── Snapshot ──────────────────────────────────────────────
  getSnapshot(): MatchSnapshot {
    return {
      now: this.now,
      phase: this.phase,
      round: this.round,
      scoreAttackers: this.scoreAttackers,
      scoreDefenders: this.scoreDefenders,
      localTeam: this.localTeam,
      phaseEndsAt: this.phaseEndsAt,
      spike: this.spike,
      actors: this.actors,
      fx: this.fx,
      killFeed: this.killFeed,
      lastResult: this.lastResult,
      over: this.over,
      winner: this.winner,
    };
  }
}
