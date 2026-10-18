// ============================================================
// Training room controller — practice-only, never reaches results.
//
// Wraps the normal world step: keeps the dummy and the player topped up, skips
// the bell, measures frame data for the player's last move, and records /
// replays one slot of dummy inputs. Pure logic, no React and no rendering.
// ============================================================

import {
  emptyInput,
  type Fighter,
  type InputCommand,
  type PunchType,
  type WorldState,
} from './fighters/types';
import { PUNCH_COMMIT_FRAMES, punchHitFrame } from './combat/punches';

export const TRAINING_SLOT_MAX = 600; // 10 s at 60 fps

export type DummyMode = 'idle' | 'recording' | 'playing';

export interface FrameDataView {
  move: PunchType;
  startup: number;
  active: number;
  recovery: number;
  total: number;
  result: 'pending' | 'hit' | 'block' | 'whiff';
  /** Frames the attacker is free before the dummy (positive = plus). Null until measured. */
  advantage: number | null;
}

export interface TrainingView {
  showHitbox: boolean;
  dummy: DummyMode;
  slotLength: number;
  frameData: FrameDataView | null;
  inputs: string[];
  held: { moveX: number; moveZ: number; block: boolean };
}

const isFree = (f: Fighter) =>
  f.state === 'idle' || f.state === 'walking' || f.state === 'blocking';

function describe(cmd: InputCommand): string | null {
  if (cmd.punch) return cmd.punch.toUpperCase();
  return null;
}

export class TrainingController {
  showHitbox = false;
  dummy: DummyMode = 'idle';
  private slot: InputCommand[] = [];
  private cursor = 0;
  private fd: (FrameDataView & { contact: number; atkFree: number; dummyFree: number }) | null =
    null;
  private prevPunching = false;
  private history: string[] = [];
  private held = { moveX: 0, moveZ: 0, block: false };
  private resetRequested = false;

  constructor(
    private readonly playerSeat: number,
    private readonly dummySeat: number,
  ) {}

  toggleHitbox(): void {
    this.showHitbox = !this.showHitbox;
  }
  requestReset(): void {
    this.resetRequested = true;
  }

  record(): void {
    this.slot = [];
    this.dummy = 'recording';
  }
  play(): void {
    if (this.slot.length === 0) return;
    this.cursor = 0;
    this.dummy = 'playing';
  }
  stop(): void {
    this.dummy = 'idle';
  }
  clear(): void {
    this.slot = [];
    this.dummy = 'idle';
  }

  /** Rewrite this tick's inputs before the world steps. */
  beforeStep(world: WorldState, inputs: Map<number, InputCommand>): void {
    if (world.phase === 'countdown') {
      world.phase = 'fight';
      world.phaseFrame = 0;
    }
    const mine = inputs.get(this.playerSeat) ?? emptyInput();
    this.held = { moveX: mine.moveX, moveZ: mine.moveZ, block: mine.block };
    const label = describe(mine);
    if (label) {
      this.history.push(label);
      if (this.history.length > 10) this.history.shift();
    }

    if (this.dummy === 'recording') {
      // The player drives the dummy while recording; their own fighter stands still.
      if (this.slot.length < TRAINING_SLOT_MAX) this.slot.push({ ...mine });
      else this.dummy = 'idle';
      inputs.set(this.dummySeat, { ...mine });
      inputs.set(this.playerSeat, emptyInput());
    } else if (this.dummy === 'playing' && this.slot.length > 0) {
      inputs.set(this.dummySeat, { ...this.slot[this.cursor] });
      this.cursor = (this.cursor + 1) % this.slot.length;
    } else {
      inputs.set(this.dummySeat, emptyInput());
    }
  }

  /** Keep both fighters healthy and measure frame data after the world steps. */
  afterStep(world: WorldState): void {
    const me = world.fighters.find((f) => f.seat === this.playerSeat);
    const dm = world.fighters.find((f) => f.seat === this.dummySeat);
    if (!me || !dm) return;

    this.measure(world, me, dm);

    for (const f of [me, dm]) {
      f.health = f.stats.maxHealth;
      f.stamina = f.stats.stamina;
      f.alive = true;
      if (f.state === 'knockedOut') {
        f.state = 'idle';
        f.stateFrame = 0;
      }
    }
    world.roundTime = world.maxRoundTime;
    world.phase = 'fight';
    if (this.resetRequested) {
      this.resetRequested = false;
      me.x = -4.4;
      me.z = 0;
      dm.x = 4.4;
      dm.z = 0;
      me.vx = me.vz = dm.vx = dm.vz = 0;
    }
  }

  private measure(world: WorldState, me: Fighter, dm: Fighter): void {
    const punching = me.state === 'punching' && !!me.currentPunch;
    if (punching && (!this.prevPunching || me.punchFrame === 0) && me.currentPunch) {
      const move = me.currentPunch.type;
      const total = PUNCH_COMMIT_FRAMES[move];
      const startup = punchHitFrame(move);
      this.fd = {
        move,
        startup,
        active: 1,
        recovery: total - startup - 1,
        total,
        result: 'pending',
        advantage: null,
        contact: -1,
        atkFree: -1,
        dummyFree: -1,
      };
    }
    this.prevPunching = punching;
    const fd = this.fd;
    if (!fd) return;

    if (fd.result === 'pending') {
      for (const ev of world.events) {
        if (ev.kind === 'hit' && ev.seat === this.playerSeat) {
          fd.result = 'hit';
          fd.contact = world.frame;
        } else if (ev.kind === 'block' && ev.seat === this.dummySeat) {
          fd.result = 'block';
          fd.contact = world.frame;
        }
      }
    }
    if (fd.result === 'pending' && isFree(me) && !punching) {
      fd.result = 'whiff';
      return;
    }
    if (fd.contact >= 0 && world.frame >= fd.contact) {
      if (fd.atkFree < 0 && isFree(me) && world.frame > fd.contact) fd.atkFree = world.frame;
      if (fd.dummyFree < 0 && isFree(dm) && world.frame > fd.contact) fd.dummyFree = world.frame;
      if (fd.atkFree >= 0 && fd.dummyFree >= 0 && fd.advantage === null) {
        fd.advantage = fd.dummyFree - fd.atkFree;
      }
    }
  }

  view(): TrainingView {
    const fd = this.fd;
    return {
      showHitbox: this.showHitbox,
      dummy: this.dummy,
      slotLength: this.slot.length,
      frameData: fd
        ? {
            move: fd.move,
            startup: fd.startup,
            active: fd.active,
            recovery: fd.recovery,
            total: fd.total,
            result: fd.result,
            advantage: fd.advantage,
          }
        : null,
      inputs: [...this.history],
      held: this.held,
    };
  }
}
