// ============================================================
// BREAKPOINT — World engine (modes + netcode)
//
// netMode:
//   solo  — simulate everything locally (vs bots / zombies).
//   host  — simulate local player + bots/zombies; act as MATCH DIRECTOR
//           (phase/score/spike/waves). Remote players arrive over the net.
//   guest — simulate ONLY the local player; everyone else (players + bots/
//           zombies) is a remote actor updated from the host's broadcasts.
//
// Combat is self-authoritative: a client applies damage to its own avatar
// (from relayed hit events) and the director owns bot/zombie HP + scoring.
// The engine produces `outEvents` that GameView drains and sends over the
// socket, and exposes apply*() methods for inbound messages.
// ============================================================
import type {
  Actor, Vec3, Team, RoundPhase, MatchSnapshot, WorldFx, Tracer,
  KillFeedEntry, RoundResult, MatchMode, NetMode, NetEvent,
  NetPlayerState, NetMatchState, NetBotState, AbilityKind, NetPlayerStat,
} from '../types';
import type { MatchConfig } from '../store';
import { BOT_NAMES } from '../store';
import { getAgent, AGENTS } from '../agents';
import { getWeapon } from '../weapons';
import {
  ATTACKER_SPAWNS, DEFENDER_SPAWNS, SITES, SITE_LIST, ARENA, type Box,
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
  ZOMBIE_WAVES, ZOMBIE_BASE_COUNT, ZOMBIE_PER_WAVE, ZOMBIE_MAX_ALIVE, ZOMBIE_HP,
  ZOMBIE_HP_PER_WAVE, ZOMBIE_SPEED, ZOMBIE_SPEED_PER_WAVE, ZOMBIE_DAMAGE,
  ZOMBIE_ATTACK_RANGE, ZOMBIE_ATTACK_CD, ZOMBIE_KILL_REWARD, ZOMBIE_WAVE_REWARD, ZOMBIE_BUY_TIME,
  ZOMBIE_TYPES,
} from '../constants';

export interface LocalInput {
  moveX: number; moveZ: number;
  jump: boolean; crouch: boolean; run: boolean;
  yaw: number; pitch: number;
  firing: boolean; ads: boolean;
  reloadEdge: boolean;
  abilityEdge: 'C' | 'Q' | 'E' | 'X' | null;
  switchEdge: 'primary' | 'sidearm' | 'knife' | null;
  plant: boolean; defuse: boolean;
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
const SURVIVOR_TEAM: Team = 'attackers';
const ZOMBIE_TEAM: Team = 'zombies';

export class World {
  config: MatchConfig;
  mode: MatchMode;
  netMode: NetMode;
  localId: string;

  actors: Actor[] = [];
  fx: WorldFx[] = [];
  tracers: Tracer[] = [];
  killFeed: KillFeedEntry[] = [];

  phase: RoundPhase = 'buy';
  round = 1;
  wave = 0;
  zombiesLeft = 0;
  scoreAttackers = 0;
  scoreDefenders = 0;
  attackersTeam: Team = 'attackers';
  phaseEndsAt = 0;
  spike = { carrierId: null as string | null, planted: false, pos: null as Vec3 | null, plantedAt: 0, defusing: false, planting: false, progress: 0 };
  lastResult: RoundResult | null = null;
  over = false;
  winner: Team | null = null;
  lossStreak: Record<string, number> = { attackers: 0, defenders: 0 };
  localTeam: Team;

  input: LocalInput = freshInput();
  now = 0;

  /** Net events to send (drained by GameView each frame). */
  outEvents: NetEvent[] = [];

  onKill?: (e: KillFeedEntry) => void;
  onRoundEnd?: (r: RoundResult) => void;
  onMatchEnd?: (winner: Team) => void;

  private dynamicWalls: { id: string; box: Box; endsAt: number }[] = [];
  private _lastDt = TICK_DT;
  private zombieCounter = 0;
  private spawnQueue = 0; // zombies still to spawn this wave
  private remoteSpike: { type: 'plant' | 'defuse'; pos: Vec3 | null; until: number } | null = null;

  constructor(config: MatchConfig) {
    this.config = config;
    this.mode = config.mode;
    this.netMode = config.netMode;
    this.localId = config.localId;
    this.localTeam = config.mode === 'zombies' ? SURVIVOR_TEAM : config.localTeam;
    this.attackersTeam = config.mode === 'zombies' ? SURVIVOR_TEAM : 'attackers';
    this.spawnActors();
    if (this.isDirector) {
      if (this.mode === 'zombies') this.startWavePrep();
      else this.startBuyPhase();
    } else {
      this.phase = 'buy';
      this.phaseEndsAt = this.now + BUY_TIME * 1000;
    }
  }

  get isDirector(): boolean { return this.netMode !== 'guest'; }
  get local(): Actor | undefined { return this.actors.find((a) => a.isLocal); }
  get wallBoxes(): Box[] { return this.dynamicWalls.map((d) => d.box); }

  // ── Setup ─────────────────────────────────────────────────
  private spawnActors() {
    const { config } = this;
    this.actors = [];
    for (const h of config.humans) {
      const isLocal = h.id === config.localId;
      const a = this.makeActor(h.id, h.name, 'human', h.team, h.agentId, isLocal);
      a.remote = !isLocal && this.netMode !== 'solo';
      this.actors.push(a);
    }
    // Director fills bots (standard) — zombies spawn per wave.
    if (this.isDirector && this.mode === 'standard') {
      this.fillBots('attackers');
      this.fillBots('defenders');
    }
  }

  private fillBots(team: Team) {
    const humans = this.actors.filter((a) => a.team === team && a.kind === 'human').length;
    const need = Math.max(0, this.config.fillToPerSide - humans);
    const usedNames = new Set(this.actors.map((a) => a.name));
    const usedAgents = new Set(this.actors.filter((a) => a.team === team).map((a) => a.agentId));
    for (let i = 0; i < need; i++) {
      let name = `BOT-${team[0].toUpperCase()}${i}`;
      const pool = BOT_NAMES.filter((n) => !usedNames.has(n));
      if (pool.length) { name = pool[Math.floor(Math.random() * pool.length)]; usedNames.add(name); }
      const apool = AGENTS.filter((ag) => !usedAgents.has(ag.id));
      const agentId = (apool.length ? apool : AGENTS)[Math.floor(Math.random() * (apool.length || AGENTS.length))].id;
      usedAgents.add(agentId);
      this.actors.push(this.makeActor(`bot_${team}_${i}`, name, 'bot', team, agentId, false));
    }
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

  // ── Standard round lifecycle (director) ───────────────────
  private startBuyPhase() {
    this.phase = 'buy';
    this.phaseEndsAt = this.now + BUY_TIME * 1000;
    this.spike = { carrierId: null, planted: false, pos: null, plantedAt: 0, defusing: false, planting: false, progress: 0 };
    this.clearWorld();

    const attackers = this.actors.filter((a) => a.team === this.attackersTeam);
    const defenders = this.actors.filter((a) => a.team !== this.attackersTeam);
    attackers.forEach((a, i) => this.respawn(a, ATTACKER_SPAWNS[i % ATTACKER_SPAWNS.length]));
    defenders.forEach((a, i) => this.respawn(a, DEFENDER_SPAWNS[i % DEFENDER_SPAWNS.length]));

    const carrier = attackers.find((a) => a.isLocal) ?? attackers[0];
    if (carrier) { carrier.hasSpike = true; this.spike.carrierId = carrier.id; }

    for (const a of this.actors) if (a.kind === 'bot') this.botBuy(a);
  }

  private clearWorld() {
    this.fx = []; this.dynamicWalls = [];
    setDynamicBoxes([]); setSmokes([]);
  }

  private respawn(a: Actor, spawn: Vec3) {
    a.pos = v(spawn.x, 0, spawn.z);
    a.spawnX = spawn.x; a.spawnZ = spawn.z;
    a.respawnSeq = (a.respawnSeq ?? 0) + 1;
    a.vel = v();
    a.alive = true; a.crouch = false;
    a.hp = a.maxHp; a.shieldHp = 0; a.armor = a.loadout.armor;
    a.blindUntil = 0; a.healUntil = 0; a.revealedUntil = 0; a.speedBoostUntil = 0;
    a.reloading = false; a.recoil = 0;
    a.yaw = Math.atan2(-a.pos.x, a.pos.z); a.pitch = 0;
    this.equip(a, a.loadout.primary ?? a.loadout.sidearm);
    a.abilityCharges = { ...a.loadout.abilities };
    a.anim.deathTime = 0; a.hasSpike = false;
  }

  private startAction() { this.phase = 'action'; this.phaseEndsAt = this.now + ROUND_TIME * 1000; }

  // ── Zombies lifecycle (director) ──────────────────────────
  private startWavePrep() {
    this.phase = 'buy';
    this.wave += 1;
    this.phaseEndsAt = this.now + (this.wave === 1 ? 8 : ZOMBIE_BUY_TIME) * 1000;
    this.clearWorld();
    // remove dead zombies, respawn survivors at attacker spawns
    this.actors = this.actors.filter((a) => !a.isZombie);
    const survivors = this.actors.filter((a) => a.team === SURVIVOR_TEAM);
    survivors.forEach((a, i) => this.respawn(a, ATTACKER_SPAWNS[i % ATTACKER_SPAWNS.length]));
    for (const a of survivors) if (a.kind === 'bot') this.botBuy(a);
    this.spawnQueue = 0;
    this.zombiesLeft = 0;
  }

  private startWave() {
    this.phase = 'action';
    this.phaseEndsAt = this.now + 9_000_000; // effectively until cleared
    const count = Math.min(40, ZOMBIE_BASE_COUNT + (this.wave - 1) * ZOMBIE_PER_WAVE);
    this.spawnQueue = count;
    this.zombiesLeft = count;
  }

  private zombieEdgeSpawn(): Vec3 {
    const side = Math.floor(Math.random() * 4);
    const m = ARENA.maxX - 2;
    const r = (Math.random() * 2 - 1) * m;
    if (side === 0) return v(r, 0, ARENA.minZ + 2);
    if (side === 1) return v(r, 0, ARENA.maxZ - 2);
    if (side === 2) return v(ARENA.minX + 2, 0, r);
    return v(ARENA.maxX - 2, 0, r);
  }

  private pickZombieType(): import('../constants').ZombieType {
    const pool = Object.values(ZOMBIE_TYPES).filter((t) => t.minWave <= this.wave);
    const total = pool.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of pool) { r -= t.weight; if (r <= 0) return t; }
    return ZOMBIE_TYPES.walker;
  }

  private spawnZombie() {
    const id = `zomb_${this.zombieCounter++}`;
    const type = this.pickZombieType();
    const z = this.makeActor(id, type.name, 'bot', ZOMBIE_TEAM, 'blaze', false);
    z.isZombie = true;
    z.zombieType = type.id;
    const baseHp = ZOMBIE_HP + (this.wave - 1) * ZOMBIE_HP_PER_WAVE;
    z.maxHp = z.hp = Math.round(baseHp * type.hpMul);
    z.zSpeed = (ZOMBIE_SPEED + (this.wave - 1) * ZOMBIE_SPEED_PER_WAVE) * type.speedMul;
    z.zDamage = ZOMBIE_DAMAGE * type.dmgMul;
    z.currentWeapon = 'knife';
    z.attackReady = 0;
    const sp = this.zombieEdgeSpawn();
    z.pos = v(sp.x, 0, sp.z);
    this.actors.push(z);
  }

  // ── Buying ────────────────────────────────────────────────
  canBuy(): boolean { return this.phase === 'buy'; }
  buyWeapon(a: Actor, weaponId: string): boolean {
    if (!this.canBuy() || !a.alive) return false;
    const w = getWeapon(weaponId);
    if (a.credits < w.cost) return false;
    a.credits -= w.cost;
    if (w.class === 'sidearm') a.loadout.sidearm = weaponId; else a.loadout.primary = weaponId;
    this.equip(a, weaponId);
    if (a.isLocal && this.netMode === 'guest') this.outEvents.push({ kind: 'buy', buyKind: 'weapon', id: weaponId, value: 0, cost: w.cost, max: 0 });
    return true;
  }
  buyArmor(a: Actor, value: number, cost: number): boolean {
    if (!this.canBuy() || !a.alive || a.loadout.armor >= value || a.credits < cost) return false;
    a.credits -= cost; a.loadout.armor = value; a.armor = value;
    if (a.isLocal && this.netMode === 'guest') this.outEvents.push({ kind: 'buy', buyKind: 'armor', id: '', value, cost, max: 0 });
    return true;
  }
  buyAbility(a: Actor, abilityId: string, cost: number, max: number): boolean {
    if (!this.canBuy() || !a.alive) return false;
    const have = a.loadout.abilities[abilityId] ?? 0;
    if (have >= max || a.credits < cost) return false;
    a.credits -= cost;
    a.loadout.abilities[abilityId] = have + 1;
    a.abilityCharges[abilityId] = (a.abilityCharges[abilityId] ?? 0) + 1;
    if (a.isLocal && this.netMode === 'guest') this.outEvents.push({ kind: 'buy', buyKind: 'ability', id: abilityId, value: 0, cost, max });
    return true;
  }

  /** Host: replay a guest's purchase on the authoritative copy. */
  applyBuy(fromId: string, e: { buyKind: 'weapon' | 'armor' | 'ability'; id: string; value: number; cost: number; max: number }) {
    if (!this.isDirector) return;
    const a = this.actors.find((x) => x.id === fromId && x.kind === 'human');
    if (!a) return;
    if (e.buyKind === 'weapon') this.buyWeapon(a, e.id);
    else if (e.buyKind === 'armor') this.buyArmor(a, e.value, e.cost);
    else this.buyAbility(a, e.id, e.cost, e.max);
  }

  /** Host: account for a guest spending its ultimate. */
  applyAbilityIntent(fromId: string, slot: 'C' | 'Q' | 'E' | 'X') {
    if (!this.isDirector || slot !== 'X') return;
    const a = this.actors.find((x) => x.id === fromId && x.kind === 'human');
    if (a) a.ultPoints = 0;
  }
  private botBuy(a: Actor) {
    const agent = getAgent(a.agentId);
    if (a.credits >= 3900) { this.buyWeapon(a, Math.random() < 0.5 ? 'vandal' : 'phantom'); this.buyArmor(a, 50, 1000); }
    else if (a.credits >= 2000) { this.buyWeapon(a, 'spectre'); this.buyArmor(a, 50, 1000); }
    else if (a.credits >= 900) { this.buyWeapon(a, 'sheriff'); this.buyArmor(a, 25, 400); }
    for (const ab of agent.abilities) { if (ab.slot === 'X' || ab.cost === 0) continue; this.buyAbility(a, ab.id, ab.cost, ab.charges); }
  }
  equip(a: Actor, weaponId: string) {
    const w = getWeapon(weaponId);
    a.currentWeapon = weaponId; a.ammo = w.magazine; a.reserve = w.reserve; a.reloading = false;
  }
  switchTo(a: Actor, slot: 'primary' | 'sidearm' | 'knife') {
    if (!a.alive) return;
    if (slot === 'knife') return this.equip(a, 'knife');
    if (slot === 'primary' && a.loadout.primary) return this.equip(a, a.loadout.primary);
    if (slot === 'sidearm') this.equip(a, a.loadout.sidearm);
  }

  // ── Main tick ─────────────────────────────────────────────
  update(dtMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    this._lastDt = dt;
    this.now += dtMs;

    this.dynamicWalls = this.dynamicWalls.filter((d) => d.endsAt > this.now);
    setDynamicBoxes(this.dynamicWalls.map((d) => d.box));
    this.fx = this.fx.filter((f) => f.endsAt > this.now);
    setSmokes(this.fx.filter((f) => f.kind === 'smoke').map((f) => ({ x: f.pos.x, y: f.pos.y + 1.2, z: f.pos.z, r: f.radius })));
    this.tracers = this.tracers.filter((t) => this.now - t.bornAt < 90);
    this.killFeed = this.killFeed.filter((k) => this.now - k.at < 6000);

    if (this.isDirector) this.tickDirector(dt);

    this.tickHazards(dt);

    const local = this.local;
    const freeze = this.phase === 'roundEnd';
    if (local && local.alive && !freeze) this.applyLocalInput(local, dt);
    else if (local) this.integrate(local, dt, 0, 0, false, false, false);

    for (const a of this.actors) {
      if (a === local) continue;
      if (a.remote) { this.interpRemote(a, dt); continue; }
      // locally-simulated bot / zombie (director only)
      if (a.isZombie) this.tickZombie(a, dt);
      else this.tickBot(a, dt);
    }

    for (const a of this.actors) {
      if (a.alive && !a.remote && a.healUntil > this.now && a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + 12 * dt);
    }
  }

  private tickDirector(dt: number) {
    void dt;
    if (this.over) return;
    if (this.mode === 'zombies') return this.tickZombieDirector();
    // standard
    if (this.phase === 'buy') { if (this.now >= this.phaseEndsAt) this.startAction(); }
    else if (this.phase === 'action') {
      this.tickSpikeInteractions();
      if (this.now >= this.phaseEndsAt) return this.endRound(this.defendersTeam(), 'time');
      this.checkElimination();
    } else if (this.phase === 'planted') {
      this.tickSpikeInteractions();
      if (this.spike.planted && this.now >= this.spike.plantedAt + SPIKE_TIME * 1000) return this.endRound(this.attackersTeam, 'spike');
      this.checkElimination();
    } else if (this.phase === 'roundEnd') {
      if (this.now >= this.phaseEndsAt) this.nextRound();
    }
  }

  private tickZombieDirector() {
    if (this.phase === 'buy') {
      if (this.now >= this.phaseEndsAt) this.startWave();
      return;
    }
    if (this.phase === 'action') {
      // trickle-spawn up to the concurrent cap
      const aliveZ = this.actors.filter((a) => a.isZombie && a.alive).length;
      if (this.spawnQueue > 0 && aliveZ < ZOMBIE_MAX_ALIVE && Math.random() < 0.06) {
        this.spawnZombie(); this.spawnQueue--;
      }
      // lose check
      const survivorsAlive = this.actors.some((a) => a.team === SURVIVOR_TEAM && a.alive);
      if (!survivorsAlive) { this.endZombies(false); return; }
      // wave clear
      if (this.spawnQueue === 0 && aliveZ === 0) {
        for (const a of this.actors) if (a.team === SURVIVOR_TEAM) a.credits = Math.min(MAX_CREDITS, a.credits + ZOMBIE_WAVE_REWARD);
        if (this.wave >= ZOMBIE_WAVES) { this.endZombies(true); return; }
        this.phase = 'roundEnd';
        this.lastResult = { round: this.wave, winner: SURVIVOR_TEAM, reason: 'elimination' };
        this.phaseEndsAt = this.now + 3000;
      }
      return;
    }
    if (this.phase === 'roundEnd') {
      if (this.now >= this.phaseEndsAt) this.startWavePrep();
    }
  }

  private endZombies(won: boolean) {
    this.over = true;
    this.winner = won ? SURVIVOR_TEAM : ZOMBIE_TEAM;
    this.phase = 'roundEnd';
    this.onMatchEnd?.(this.winner);
  }

  private checkElimination() {
    const attAlive = this.actors.some((a) => a.team === this.attackersTeam && a.alive);
    const defAlive = this.actors.some((a) => a.team !== this.attackersTeam && a.team !== ZOMBIE_TEAM && a.alive);
    if (!defAlive && this.phase !== 'planted') return this.endRound(this.attackersTeam, 'elimination');
    if (!attAlive) { if (this.spike.planted) return; this.endRound(this.defendersTeam(), 'elimination'); }
  }

  private defendersTeam(): Team { return this.attackersTeam === 'attackers' ? 'defenders' : 'attackers'; }

  private endRound(winner: Team, reason: RoundResult['reason']) {
    if (this.phase === 'roundEnd' || this.over) return;
    this.phase = 'roundEnd';
    this.phaseEndsAt = this.now + ROUND_END_TIME * 1000;
    this.lastResult = { round: this.round, winner, reason };
    if (winner === 'attackers') this.scoreAttackers++; else this.scoreDefenders++;
    const loser = winner === 'attackers' ? 'defenders' : 'attackers';
    this.lossStreak[winner] = 0;
    this.lossStreak[loser] = Math.min(2, this.lossStreak[loser] + 1);
    for (const a of this.actors) {
      if (a.team === ZOMBIE_TEAM) continue;
      if (a.team === winner) a.credits = Math.min(MAX_CREDITS, a.credits + WIN_REWARD);
      else a.credits = Math.min(MAX_CREDITS, a.credits + LOSS_BONUS[this.lossStreak[loser]]);
      if (a.team === this.attackersTeam && this.spike.planted) a.credits = Math.min(MAX_CREDITS, a.credits + PLANT_REWARD);
    }
    this.onRoundEnd?.(this.lastResult);
    if (this.scoreAttackers >= ROUNDS_TO_WIN || this.scoreDefenders >= ROUNDS_TO_WIN) {
      this.over = true;
      this.winner = this.scoreAttackers >= ROUNDS_TO_WIN ? 'attackers' : 'defenders';
      this.onMatchEnd?.(this.winner);
    }
  }

  private nextRound() {
    this.round++;
    if (this.round === HALF_ROUNDS + 1) this.attackersTeam = this.attackersTeam === 'attackers' ? 'defenders' : 'attackers';
    this.startBuyPhase();
  }

  // ── Local input ───────────────────────────────────────────
  private applyLocalInput(a: Actor, dt: number) {
    const inp = this.input;
    a.yaw = inp.yaw;
    a.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch));
    a.crouch = inp.crouch;
    const move = this.localToWorld(a.yaw, inp.moveX, inp.moveZ);
    this.integrate(a, dt, move.x, move.z, inp.jump, inp.crouch, inp.run);
    if (inp.switchEdge) { this.switchTo(a, inp.switchEdge); inp.switchEdge = null; }
    if (inp.reloadEdge) { this.beginReload(a); inp.reloadEdge = false; }
    this.tickReload(a);
    if (inp.abilityEdge) { this.castAbility(a, inp.abilityEdge); inp.abilityEdge = null; }
    if (inp.firing && this.phase !== 'buy') this.tryFire(a);
    // spike intent (guest sends; director handles in tickSpikeInteractions)
    if (this.mode === 'standard' && !this.isDirector) {
      if (a.team === this.attackersTeam && a.hasSpike && inp.plant && this.onSite(a)) {
        this.outEvents.push({ kind: 'spike', type: 'plant', active: true, pos: v(a.pos.x, 0, a.pos.z) });
      } else if (a.team !== this.attackersTeam && this.spike.planted && inp.defuse && this.spike.pos && dist2D(a.pos, this.spike.pos) < 2) {
        this.outEvents.push({ kind: 'spike', type: 'defuse', active: true, pos: null });
      }
    }
  }

  private localToWorld(yaw: number, strafe: number, forward: number): Vec3 {
    const fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const sx = Math.cos(yaw), sz = Math.sin(yaw);
    return { x: fx * forward + sx * strafe, y: 0, z: fz * forward + sz * strafe };
  }

  private integrate(a: Actor, dt: number, wishX: number, wishZ: number, jump: boolean, crouch: boolean, run: boolean) {
    const agent = getAgent(a.agentId);
    let max = crouch ? CROUCH_SPEED : (run ? RUN_SPEED : WALK_SPEED);
    max *= agent.passive?.moveMul ?? 1;
    if (a.isZombie) max = a.zSpeed ?? (ZOMBIE_SPEED + (this.wave - 1) * ZOMBIE_SPEED_PER_WAVE);
    if (a.speedBoostUntil > this.now) max *= 1.35;
    if (a.hasSpike) max *= 0.97;
    const wishLen = Math.hypot(wishX, wishZ);
    let wx = 0, wz = 0;
    if (wishLen > 0.001) { wx = wishX / wishLen; wz = wishZ / wishLen; }
    if (wishLen > 0.001) {
      a.vel.x += (wx * max - a.vel.x) * Math.min(1, ACCEL * dt / Math.max(1, max));
      a.vel.z += (wz * max - a.vel.z) * Math.min(1, ACCEL * dt / Math.max(1, max));
    } else {
      const fr = Math.max(0, 1 - FRICTION * dt / Math.max(1, max));
      a.vel.x *= fr; a.vel.z *= fr;
    }
    if (a.onGround && jump) { a.vel.y = JUMP_VELOCITY; a.onGround = false; }
    a.vel.y -= GRAVITY * dt;
    a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt; a.pos.y += a.vel.y * dt;
    resolveHorizontal(a.pos, PLAYER_RADIUS);
    const floor = groundHeightAt(a.pos.x, a.pos.z, PLAYER_RADIUS);
    if (a.pos.y <= floor + 0.001) { a.pos.y = floor; if (a.vel.y < 0) a.vel.y = 0; a.onGround = true; }
    else a.onGround = false;
    a.anim.moveSpeed = Math.min(1, Math.hypot(a.vel.x, a.vel.z) / RUN_SPEED);
    a.recoil = Math.max(0, a.recoil - dt * 6);
  }

  // ── Remote actor interpolation ────────────────────────────
  private interpRemote(a: Actor, dt: number) {
    const n = a.net;
    if (!n) return;
    const k = Math.min(1, dt * 16);
    a.pos.x += (n.px - a.pos.x) * k;
    a.pos.y += (n.py - a.pos.y) * k;
    a.pos.z += (n.pz - a.pos.z) * k;
    let dy = ((n.yaw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    a.yaw += dy * k;
    a.pitch += (n.pitch - a.pitch) * k;
    a.anim.moveSpeed = n.moveSpeed;
    a.crouch = n.crouch;
    if (n.firing > a.anim.firing) a.anim.firing = n.firing;
  }

  // ── Bots / zombies (director) ─────────────────────────────
  private tickBot(a: Actor, dt: number) {
    if (!a.alive) { this.integrate(a, dt, 0, 0, false, false, false); return; }
    if (this.phase === 'roundEnd' || this.phase === 'buy') { this.integrate(a, dt, 0, 0, false, false, false); return; }
    const bw: BotWorld = {
      now: this.now, actors: this.actors, spikePlanted: this.spike.planted, spikePos: this.spike.pos,
      localTeamAttacking: this.attackersTeam === this.localTeam, attackersTeam: this.attackersTeam,
    };
    const intent = botThink(a, bw, this.config.botDifficulty);
    a.yaw += this.angleLerp(a.yaw, intent.wantYaw, dt * (4 + this.config.botDifficulty * 6));
    a.pitch += (intent.wantPitch - a.pitch) * Math.min(1, dt * 8);
    a.crouch = intent.crouch;
    this.integrate(a, dt, intent.moveX, intent.moveZ, false, intent.crouch, true);
    this.tickReload(a);
    if (a.ammo === 0 && !a.reloading) this.beginReload(a);
    if (intent.fire) this.tryFire(a);
    if (this.phase === 'action' && Math.random() < 0.002) this.botUseAbility(a);
    if (intent.wantPlant) this.handlePlant(a, dt);
    if (intent.wantDefuse) this.handleDefuse(a, dt);
  }

  private tickZombie(a: Actor, dt: number) {
    if (!a.alive) { this.integrate(a, dt, 0, 0, false, false, false); return; }
    // nearest living survivor
    let target: Actor | null = null; let best = Infinity;
    for (const s of this.actors) {
      if (s.team !== SURVIVOR_TEAM || !s.alive) continue;
      const d = dist2D(a.pos, s.pos);
      if (d < best) { best = d; target = s; }
    }
    if (!target) { this.integrate(a, dt, 0, 0, false, false, false); return; }
    const dx = target.pos.x - a.pos.x, dz = target.pos.z - a.pos.z;
    a.yaw += this.angleLerp(a.yaw, Math.atan2(dx, -dz), dt * 6);
    const range = a.zombieType === 'spitter' ? ZOMBIE_ATTACK_RANGE + 1.4 : ZOMBIE_ATTACK_RANGE;
    const reach = best > range;
    this.integrate(a, dt, reach ? Math.sin(a.yaw) : 0, reach ? -Math.cos(a.yaw) : 0, false, false, true);
    a.anim.moveSpeed = reach ? 1 : 0;
    if (best <= range && (a.attackReady ?? 0) <= this.now) {
      a.attackReady = this.now + ZOMBIE_ATTACK_CD * 1000;
      a.anim.firing = this.now;
      this.dealDamage(target, a, a.zDamage ?? ZOMBIE_DAMAGE, false, 'Zombie');
    }
  }

  private angleLerp(from: number, to: number, t: number): number {
    const diff = ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return diff * Math.min(1, t);
  }

  // ── Reload ────────────────────────────────────────────────
  beginReload(a: Actor) {
    const w = getWeapon(a.currentWeapon);
    if (a.reloading || a.ammo >= w.magazine || a.reserve <= 0 || w.class === 'melee') return;
    a.reloading = true; a.reloadEnd = this.now + w.reloadTime * 1000;
  }
  private tickReload(a: Actor) {
    if (!a.reloading) return;
    if (this.now >= a.reloadEnd) {
      const w = getWeapon(a.currentWeapon);
      const take = Math.min(w.magazine - a.ammo, a.reserve);
      a.ammo += take; a.reserve -= take; a.reloading = false;
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
    for (let p = 0; p < pellets; p++) this.fireRay(a, w, spread);
    return true;
  }

  private fireRay(a: Actor, w: ReturnType<typeof getWeapon>, spread: number) {
    const origin = v(a.pos.x, a.pos.y + (a.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT), a.pos.z);
    const yaw = a.yaw + (Math.random() - 0.5) * spread * 2;
    const pitch = a.pitch + (Math.random() - 0.5) * spread * 2;
    const dir = v(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const maxT = w.range;
    const wallHit = raycastBoxes(origin, dir, maxT);
    let bestT = wallHit ? wallHit.t : maxT;
    let victim: Actor | null = null; let headshot = false;
    for (const t of this.actors) {
      if (!t.alive || t === a) continue;
      if (t.team === a.team) continue;
      const base = v(t.pos.x, t.pos.y, t.pos.z);
      const headC = v(t.pos.x, t.pos.y + (t.crouch ? HEAD_HEIGHT - 0.55 : HEAD_HEIGHT), t.pos.z);
      const th = raySphere(origin, dir, headC, HEAD_RADIUS, bestT);
      if (th !== null && th < bestT) { bestT = th; victim = t; headshot = true; }
      const bh = rayCapsule(origin, dir, base, t.crouch ? PLAYER_HEIGHT * 0.62 : PLAYER_HEIGHT, PLAYER_RADIUS, bestT);
      if (bh !== null && bh < bestT) { bestT = bh; victim = t; headshot = false; }
    }
    const end = v(origin.x + dir.x * bestT, origin.y + dir.y * bestT, origin.z + dir.z * bestT);
    this.tracers.push({ id: TRACER_ID++, from: origin, to: end, bornAt: this.now, team: a.team, hit: !!victim });
    if (victim) {
      const dmg = headshot ? w.damageHead : w.damageBody;
      // zombies take reduced headshot multiplier? keep full for satisfying kills
      this.dealDamage(victim, a, dmg, headshot, w.name);
    }
  }

  /** Route damage: remote actors get a relay event; local-sim actors apply now. */
  private dealDamage(victim: Actor, attacker: Actor, dmg: number, head: boolean, weapon: string) {
    if (!victim.alive) return;
    if (victim.remote) {
      this.outEvents.push(victim.kind === 'human'
        ? { kind: 'hit', target: victim.id, dmg, head, weapon }
        : { kind: 'bhit', target: victim.id, dmg, head, weapon });
      return;
    }
    this.applyDamage(victim, attacker, dmg, head, weapon);
  }

  private applyDamage(victim: Actor, attacker: Actor | null, dmg: number, headshot: boolean, weapon: string) {
    if (!victim.alive) return;
    victim.anim.hitFlash = this.now;
    if (attacker) victim.lastHitBy = attacker.id;
    if (victim.shieldHp > 0) { const a = Math.min(victim.shieldHp, dmg * 0.5); victim.shieldHp -= a; dmg -= a; }
    if (victim.armor > 0 && dmg > 0) { const ab = Math.min(victim.armor, dmg * 0.5); victim.armor -= ab; dmg -= ab; }
    victim.hp -= dmg;
    if (victim.hp <= 0) { victim.hp = 0; this.kill(victim, attacker, headshot, weapon); }
  }

  private kill(victim: Actor, killer: Actor | null, headshot: boolean, weapon: string) {
    victim.alive = false; victim.deaths++; victim.anim.deathTime = this.now; victim.vel = v();
    if (victim.hasSpike) {
      victim.hasSpike = false;
      const carrier = this.actors.find((x) => x.alive && x.team === this.attackersTeam);
      if (carrier && !this.spike.planted) { carrier.hasSpike = true; this.spike.carrierId = carrier.id; }
    }
    if (killer && killer !== victim && killer.team !== victim.team) {
      killer.kills++;
      killer.score += headshot ? 250 : 200;
      const reward = victim.isZombie ? ZOMBIE_KILL_REWARD : KILL_REWARD;
      killer.credits = Math.min(MAX_CREDITS, killer.credits + reward);
      killer.ultPoints = Math.min(10, killer.ultPoints + 1);
    }
    const entry: KillFeedEntry = {
      id: KF_ID++, killer: killer?.name ?? 'world', victim: victim.name, weapon,
      headshot, killerTeam: killer?.team ?? victim.team, victimTeam: victim.team, at: this.now,
    };
    this.killFeed.unshift(entry);
    this.onKill?.(entry);
  }

  // ── Spike (director) ──────────────────────────────────────
  private onSite(a: Actor): boolean { return SITE_LIST.some((s) => dist2D(a.pos, s) < s.r); }

  private tickSpikeInteractions() {
    const local = this.local;
    let acted = false;
    // host-local player intent
    if (local && local.alive) {
      if (local.team === this.attackersTeam && !this.spike.planted && local.hasSpike && this.input.plant && this.onSite(local)) { this.handlePlant(local, this._lastDt); acted = true; }
      else if (local.team !== this.attackersTeam && this.spike.planted && this.input.defuse && this.spike.pos && dist2D(local.pos, this.spike.pos) < 2) { this.handleDefuse(local, this._lastDt); acted = true; }
    }
    // remote player intent
    if (!acted && this.remoteSpike && this.remoteSpike.until > this.now) {
      const rs = this.remoteSpike;
      if (rs.type === 'plant' && !this.spike.planted && rs.pos) {
        const fake: Actor = { pos: rs.pos, hasSpike: true } as Actor;
        if (this.onSite(fake)) { this.handlePlant(this.actors.find((a) => a.hasSpike) ?? local!, this._lastDt, rs.pos); acted = true; }
      } else if (rs.type === 'defuse' && this.spike.planted) { this.handleDefuse(local ?? this.actors[0], this._lastDt); acted = true; }
    }
    if (!acted && (this.spike.planting || this.spike.defusing)) {
      this.spike.progress = Math.max(0, this.spike.progress - this._lastDt * 0.5);
      if (this.spike.progress <= 0) { this.spike.planting = false; this.spike.defusing = false; }
    }
  }

  private handlePlant(a: Actor, dt: number, posOverride?: Vec3) {
    if (this.spike.planted) return;
    const pos = posOverride ?? a.pos;
    this.spike.planting = true; this.spike.defusing = false;
    this.spike.progress = Math.min(1, this.spike.progress + dt / PLANT_TIME);
    if (this.spike.progress >= 1) {
      this.spike.planted = true; this.spike.planting = false;
      this.spike.pos = v(pos.x, 0, pos.z); this.spike.plantedAt = this.now; this.spike.progress = 0;
      if (a) { a.hasSpike = false; a.ultPoints = Math.min(10, a.ultPoints + 1); }
      this.phase = 'planted'; this.phaseEndsAt = this.now + SPIKE_TIME * 1000;
    }
  }
  private handleDefuse(a: Actor, dt: number) {
    if (!this.spike.planted || !this.spike.pos) return;
    this.spike.defusing = true; this.spike.planting = false;
    this.spike.progress = Math.min(1, this.spike.progress + dt / DEFUSE_TIME);
    if (this.spike.progress >= 1) { this.spike.defusing = false; this.endRound(this.defendersTeam(), 'defuse'); }
    void a;
  }

  // ── Abilities ─────────────────────────────────────────────
  castAbility(a: Actor, slot: 'C' | 'Q' | 'E' | 'X') {
    if (!a.alive || this.phase === 'buy') return;
    const agent = getAgent(a.agentId);
    const ab = agent.abilities.find((x) => x.slot === slot);
    if (!ab) return;
    if (slot === 'X') { if (a.ultPoints < (ab.ultPoints ?? 8)) return; a.ultPoints = 0; }
    else { const have = a.abilityCharges[ab.id] ?? 0; if (have <= 0) return; a.abilityCharges[ab.id] = have - 1; }
    a.anim.casting = this.now;
    this.executeAbility(a, ab.kind, slot === 'X');
    if (a.isLocal && this.netMode === 'guest' && slot === 'X') this.outEvents.push({ kind: 'ability', slot });
  }
  private botUseAbility(a: Actor) {
    const agent = getAgent(a.agentId);
    for (const ab of agent.abilities) {
      if (ab.slot === 'X') { if (a.ultPoints >= (ab.ultPoints ?? 8)) { this.castAbility(a, 'X'); return; } continue; }
      if ((a.abilityCharges[ab.id] ?? 0) > 0) { this.castAbility(a, ab.slot); return; }
    }
  }
  private forward(a: Actor, dist: number): Vec3 { return v(a.pos.x + Math.sin(a.yaw) * dist, a.pos.y, a.pos.z - Math.cos(a.yaw) * dist); }

  private executeAbility(a: Actor, kind: AbilityKind, ult: boolean) {
    const now = this.now;
    switch (kind) {
      case 'dash': { const p = ult ? 11 : 9; a.vel.x = Math.sin(a.yaw) * p; a.vel.z = -Math.cos(a.yaw) * p; a.vel.y = 2.4; a.onGround = false; break; }
      case 'heal': { a.healUntil = now + (ult ? 3000 : 4000); if (ult) { a.hp = a.maxHp; a.shieldHp = 50; } break; }
      case 'shield': { a.shieldHp = Math.max(a.shieldHp, ult ? 75 : 50); if (ult) a.speedBoostUntil = now + 6000; break; }
      case 'smoke': { const p = this.forward(a, 8); const f = groundHeightAt(p.x, p.z); this.spawnFx({ id: `fx${FX_ID++}`, kind: 'smoke', team: a.team, pos: v(p.x, f, p.z), radius: 4, endsAt: now + 12000, ownerId: a.id }, true); break; }
      case 'wall': { const p = this.forward(a, 4); this.spawnFx({ id: `fx${FX_ID++}`, kind: 'wall', team: a.team, pos: v(p.x, 0, p.z), radius: 3, endsAt: now + 12000, ownerId: a.id }, true, a.yaw); break; }
      case 'flash': { const p = this.forward(a, ult ? 6 : 10); this.spawnFx({ id: `fx${FX_ID++}`, kind: 'flash', team: a.team, pos: v(p.x, 1.4, p.z), radius: ult ? 40 : 16, endsAt: now + 400, ownerId: a.id }, true); break; }
      case 'recon': { const ar = ult ? 999 : 18; const p = ult ? a.pos : this.forward(a, 10); this.spawnFx({ id: `fx${FX_ID++}`, kind: 'recon', team: a.team, pos: v(p.x, 1, p.z), radius: ar, endsAt: now + 4000, ownerId: a.id }, true); break; }
      case 'molly': { const p = this.forward(a, ult ? 0 : 9); const f = groundHeightAt(p.x, p.z); this.spawnFx({ id: `fx${FX_ID++}`, kind: 'molly', team: a.team, pos: v(p.x, f, p.z), radius: ult ? 9 : 3.5, endsAt: now + (ult ? 3000 : 5000), ownerId: a.id }, true); break; }
    }
  }

  /** Spawn a world fx locally and (if it was cast here) queue it for the network. */
  private spawnFx(fx: WorldFx, localCast: boolean, yaw = 0) {
    if (fx.kind === 'wall') {
      const box: Box = { cx: fx.pos.x, cy: 1.2, cz: fx.pos.z, hx: Math.abs(Math.cos(yaw)) * 3 + 0.4, hy: 1.2, hz: Math.abs(Math.sin(yaw)) * 3 + 0.4, color: fx.team === 'attackers' ? '#ff4655' : '#16e0a3', solid: true };
      this.dynamicWalls.push({ id: fx.id, box, endsAt: fx.endsAt });
    }
    this.fx.push(fx);
    if (fx.kind === 'flash') {
      for (const t of this.actors) {
        if (!t.alive || t.remote) continue;            // only blind locally-simulated actors
        if (t.team === fx.team) continue;
        const d = dist2D(t.pos, fx.pos);
        if (d > fx.radius + 2) continue;
        const eye = v(t.pos.x, t.pos.y + 1.5, t.pos.z);
        if (!hasLineOfSight(eye, fx.pos)) continue;
        const ang = Math.atan2(fx.pos.x - t.pos.x, -(fx.pos.z - t.pos.z));
        const diff = Math.abs(((ang - t.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const dur = diff < 1.0 ? 1800 : diff < 1.8 ? 900 : 300;
        t.blindUntil = Math.max(t.blindUntil, this.now + dur);
      }
    } else if (fx.kind === 'recon') {
      for (const t of this.actors) { if (t.alive && t.team !== fx.team && t.team !== ZOMBIE_TEAM) { if (dist2D(t.pos, fx.pos) <= fx.radius) t.revealedUntil = this.now + 3500; } }
    }
    if (localCast && this.netMode !== 'solo') this.outEvents.push({ kind: 'fx', fx });
  }

  private tickHazards(dt: number) {
    for (const f of this.fx) {
      if (f.kind !== 'molly') continue;
      for (const t of this.actors) {
        if (!t.alive || t.remote || t.team === f.team) continue; // self-authoritative: only damage local-sim actors
        if (dist2D(t.pos, f.pos) <= f.radius && Math.abs(t.pos.y - f.pos.y) < 2.5) {
          this.applyDamage(t, this.actors.find((x) => x.id === f.ownerId) ?? null, 30 * dt, false, 'Hazard');
        }
      }
    }
  }

  // ── Networking: outbound state ────────────────────────────
  getPlayerState(): NetPlayerState | null {
    const a = this.local; if (!a) return null;
    return {
      px: a.pos.x, py: a.pos.y, pz: a.pos.z, yaw: a.yaw, pitch: a.pitch,
      hp: a.hp, armor: a.armor, shieldHp: a.shieldHp, alive: a.alive, crouch: a.crouch,
      weapon: a.currentWeapon, agentId: a.agentId, team: a.team,
      moveSpeed: a.anim.moveSpeed, firing: a.anim.firing, name: a.name, hasSpike: a.hasSpike,
    };
  }

  getMatchState(): NetMatchState {
    const bots: NetBotState[] = this.actors.filter((a) => a.kind === 'bot').map((b) => ({
      id: b.id, name: b.name, team: b.team, agentId: b.agentId,
      px: b.pos.x, py: b.pos.y, pz: b.pos.z, yaw: b.yaw, pitch: b.pitch,
      hp: b.hp, alive: b.alive, isZombie: !!b.isZombie, zombieType: b.zombieType, moveSpeed: b.anim.moveSpeed, firing: b.anim.firing, crouch: b.crouch,
    }));
    const players: NetPlayerStat[] = this.actors.filter((a) => a.kind === 'human').map((p) => ({
      id: p.id, credits: p.credits, kills: p.kills, deaths: p.deaths, score: p.score, ult: p.ultPoints,
      alive: p.alive, hasSpike: p.hasSpike, respawnSeq: p.respawnSeq ?? 0, spawnX: p.spawnX ?? p.pos.x, spawnZ: p.spawnZ ?? p.pos.z,
      weapon: p.loadout.primary ?? p.loadout.sidearm, armor: p.loadout.armor,
    }));
    return {
      now: this.now, mode: this.mode, phase: this.phase, round: this.round, wave: this.wave, zombiesLeft: this.zombiesLeft,
      scoreAttackers: this.scoreAttackers, scoreDefenders: this.scoreDefenders, attackersTeam: this.attackersTeam,
      phaseEndsAt: this.phaseEndsAt, spike: this.spike, over: this.over, winner: this.winner, bots, players,
    };
  }

  drainEvents(): NetEvent[] { if (!this.outEvents.length) return []; const e = this.outEvents; this.outEvents = []; return e; }

  /** A networked player disconnected — drop their actor. */
  removeActor(id: string) { this.actors = this.actors.filter((a) => a.id !== id || a.isLocal); }

  // ── Networking: inbound apply ─────────────────────────────
  applyRemotePlayer(id: string, st: NetPlayerState) {
    let a = this.actors.find((x) => x.id === id);
    if (!a) {
      a = this.makeActor(id, st.name, 'human', st.team, st.agentId, false);
      a.remote = true; this.actors.push(a);
    }
    a.remote = true;
    a.team = st.team; a.agentId = st.agentId; a.currentWeapon = st.weapon; a.name = st.name;
    a.hp = st.hp; a.armor = st.armor; a.shieldHp = st.shieldHp; a.alive = st.alive; a.hasSpike = st.hasSpike;
    if (!a.alive && a.anim.deathTime === 0) a.anim.deathTime = this.now;
    if (a.alive) a.anim.deathTime = 0;
    a.net = { px: st.px, py: st.py, pz: st.pz, yaw: st.yaw, pitch: st.pitch, t: this.now, moveSpeed: st.moveSpeed, firing: st.firing, crouch: st.crouch };
  }

  applyMatchState(st: NetMatchState) {
    if (this.isDirector) return;
    this.now = st.now;
    this.mode = st.mode; this.phase = st.phase; this.round = st.round; this.wave = st.wave; this.zombiesLeft = st.zombiesLeft;
    this.scoreAttackers = st.scoreAttackers; this.scoreDefenders = st.scoreDefenders; this.attackersTeam = st.attackersTeam;
    this.phaseEndsAt = st.phaseEndsAt; this.spike = st.spike; this.over = st.over; this.winner = st.winner;
    this.lastNetAt = st.now;
    if (st.players) for (const ps of st.players) this.applyPlayerStat(ps);
    this.reconcileBots(st.bots);
  }

  /** Adopt host-authoritative economy/scoreboard + handle round-start respawn. */
  private applyPlayerStat(ps: NetPlayerStat) {
    const a = this.actors.find((x) => x.id === ps.id && x.kind === 'human');
    if (!a) return;
    a.credits = ps.credits; a.kills = ps.kills; a.deaths = ps.deaths; a.score = ps.score; a.ultPoints = ps.ult; a.hasSpike = ps.hasSpike;
    const respawned = ps.respawnSeq > (a.respawnSeq ?? 0);
    a.respawnSeq = ps.respawnSeq;
    if (respawned) {
      // round/wave reset — teleport + restore
      a.alive = true;
      a.hp = a.maxHp; a.shieldHp = 0; a.armor = ps.armor; a.loadout.armor = ps.armor;
      a.blindUntil = 0; a.recoil = 0; a.reloading = false; a.healUntil = 0; a.speedBoostUntil = 0;
      this.equip(a, ps.weapon);
      if (a.isLocal) { a.pos = v(ps.spawnX, 0, ps.spawnZ); a.vel = v(); a.anim.deathTime = 0; }
      else { a.net = { px: ps.spawnX, py: 0, pz: ps.spawnZ, yaw: a.yaw, pitch: 0, t: this.now, moveSpeed: 0, firing: 0, crouch: false }; a.pos = v(ps.spawnX, 0, ps.spawnZ); a.anim.deathTime = 0; }
    } else if (!ps.alive && a.alive) {
      a.alive = false; if (a.anim.deathTime === 0) a.anim.deathTime = this.now;
    }
  }

  lastNetAt = 0;

  private reconcileBots(list: NetBotState[]) {
    const seen = new Set<string>();
    for (const b of list) {
      seen.add(b.id);
      let a = this.actors.find((x) => x.id === b.id);
      if (!a) { a = this.makeActor(b.id, b.name, 'bot', b.team, b.agentId, false); a.remote = true; a.isZombie = b.isZombie; this.actors.push(a); }
      a.remote = true; a.isZombie = b.isZombie; a.zombieType = b.zombieType; a.team = b.team; a.hp = b.hp; a.alive = b.alive;
      if (!a.alive && a.anim.deathTime === 0) a.anim.deathTime = this.now;
      if (a.alive) a.anim.deathTime = 0;
      a.net = { px: b.px, py: b.py, pz: b.pz, yaw: b.yaw, pitch: b.pitch, t: this.now, moveSpeed: b.moveSpeed, firing: b.firing, crouch: b.crouch };
    }
    // drop bots no longer present
    this.actors = this.actors.filter((a) => a.kind !== 'bot' || seen.has(a.id) || !a.remote);
  }

  /** Inbound damage to our own avatar (from a relayed hit). */
  applyIncomingHit(fromId: string, dmg: number, head: boolean, weapon: string) {
    const v0 = this.local; if (!v0 || !v0.alive) return;
    v0.anim.hitFlash = this.now; v0.lastHitBy = fromId;
    if (v0.shieldHp > 0) { const s = Math.min(v0.shieldHp, dmg * 0.5); v0.shieldHp -= s; dmg -= s; }
    if (v0.armor > 0 && dmg > 0) { const ab = Math.min(v0.armor, dmg * 0.5); v0.armor -= ab; dmg -= ab; }
    v0.hp -= dmg;
    if (v0.hp <= 0) { v0.hp = 0; this.handleLocalDeath(fromId, weapon, head); }
  }

  private handleLocalDeath(killerId: string, weapon: string, head: boolean) {
    const a = this.local; if (!a) return;
    a.alive = false; a.deaths++; a.anim.deathTime = this.now; a.vel = v();
    if (a.hasSpike) a.hasSpike = false;
    this.outEvents.push({ kind: 'death', killer: killerId, weapon, head });
    if (this.isDirector) this.tallyKill(a.id, killerId, weapon, head);
  }

  /** Host: a guest reported its death — update scores / round. */
  applyRemoteDeath(victimId: string, killerId: string, weapon: string, head: boolean) {
    const v0 = this.actors.find((x) => x.id === victimId);
    if (v0) { v0.alive = false; if (v0.anim.deathTime === 0) v0.anim.deathTime = this.now; }
    if (this.isDirector) this.tallyKill(victimId, killerId, weapon, head);
    else {
      // guest: killfeed only
      const killer = this.actors.find((x) => x.id === killerId);
      this.pushFeed(killer?.name ?? '—', v0?.name ?? '—', weapon, head, killer?.team ?? 'attackers', v0?.team ?? 'defenders');
    }
  }

  private tallyKill(victimId: string, killerId: string, weapon: string, head: boolean) {
    const victim = this.actors.find((x) => x.id === victimId);
    const killer = this.actors.find((x) => x.id === killerId);
    if (victim) { victim.alive = false; victim.deaths = Math.max(victim.deaths, victim.deaths); }
    if (killer && killer.id !== victimId && killer.team !== victim?.team) {
      killer.kills++; killer.score += head ? 250 : 200;
      killer.credits = Math.min(MAX_CREDITS, killer.credits + KILL_REWARD);
      killer.ultPoints = Math.min(10, killer.ultPoints + 1);
    }
    this.pushFeed(killer?.name ?? '—', victim?.name ?? '—', weapon, head, killer?.team ?? 'attackers', victim?.team ?? 'defenders');
    if (this.mode === 'standard') this.checkElimination();
  }

  private pushFeed(killer: string, victim: string, weapon: string, head: boolean, kt: Team, vt: Team) {
    this.killFeed.unshift({ id: KF_ID++, killer, victim, weapon, headshot: head, killerTeam: kt, victimTeam: vt, at: this.now });
    this.onKill?.(this.killFeed[0]);
  }

  /** Host: a guest shot one of our bots/zombies. */
  applyBotHit(fromId: string, targetId: string, dmg: number, head: boolean, weapon: string) {
    if (!this.isDirector) return;
    const bot = this.actors.find((x) => x.id === targetId && x.kind === 'bot');
    if (!bot || !bot.alive) return;
    const attacker = this.actors.find((x) => x.id === fromId) ?? null;
    this.applyDamage(bot, attacker, dmg, head, weapon);
  }

  /** Any client: spawn a relayed fx (not re-broadcast). */
  applyRemoteFx(fx: WorldFx) { this.spawnFx(fx, false, 0); }

  /** Host: a remote player's plant/defuse intent. */
  applySpikeIntent(_playerId: string, type: 'plant' | 'defuse', active: boolean, pos: Vec3 | null) {
    if (!this.isDirector || this.mode !== 'standard') return;
    if (!active) { this.remoteSpike = null; return; }
    this.remoteSpike = { type, pos, until: this.now + 300 };
  }

  // ── Snapshot ──────────────────────────────────────────────
  getSnapshot(): MatchSnapshot {
    return {
      now: this.now, mode: this.mode, wave: this.wave, zombiesLeft: this.zombiesLeft,
      phase: this.phase, round: this.round, scoreAttackers: this.scoreAttackers, scoreDefenders: this.scoreDefenders,
      localTeam: this.localTeam, phaseEndsAt: this.phaseEndsAt, spike: this.spike,
      actors: this.actors, fx: this.fx, killFeed: this.killFeed,
      lastResult: this.lastResult, over: this.over, winner: this.winner,
    };
  }
}
