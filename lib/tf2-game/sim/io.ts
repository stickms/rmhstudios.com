/**
 * Entity I/O: outputs, the event queue, and target-name resolution. Mirrors
 * the SDK's CBaseEntityOutput (FireOutput), CEventQueue (AddEvent /
 * ServiceEvents) and CGlobalEntityList::FindEntityByName (procedural names
 * like !activator).
 *
 * Every output goes through the queue, even with no delay — that is how the
 * engine works, and maps depend on the ordering it gives: an event is due at
 * curtime + delay and fires after every event already queued for the same
 * time (FIFO), and events added while servicing that are already due fire in
 * the same pass.
 */

import { parseEntityOutput } from '../formats/keyvalues';
import type { Entity } from './entity';

/** One connection of an output ("target,input,param,delay,times"). SDK: CEventAction. */
export interface OutputAction {
  target: string;
  input: string;
  /** '' means "pass the output's own value". */
  parameter: string;
  delay: number;
  /** -1 = always (EVENT_FIRE_ALWAYS). */
  timesToFire: number;
  /** Unique id stamp (CEventAction::m_iIDStamp). */
  id: number;
}

let nextActionId = 1;

/** Parses "target,input,param,delay,times" (comma or ESC separated). */
export function parseOutputAction(value: string): OutputAction {
  const p = parseEntityOutput(value);
  return {
    target: p.target,
    input: p.input,
    parameter: p.parameter,
    delay: p.delay,
    timesToFire: Number.isFinite(p.timesToFire) && p.timesToFire !== 0 ? p.timesToFire : -1,
    id: nextActionId++,
  };
}

/** Parses AddOutput's colon form "OnTrigger target:input:param:delay:times". */
export function parseAddOutput(value: string): { output: string; action: OutputAction } | null {
  const sp = value.indexOf(' ');
  if (sp <= 0) return null;
  const output = value.slice(0, sp).trim();
  const rest = value.slice(sp + 1).trim();
  const parts = rest.split(':');
  if (parts.length < 2) return null;
  const delay = parseFloat(parts[3] ?? '0');
  const times = parts[4] !== undefined && parts[4] !== '' ? parseInt(parts[4], 10) : -1;
  return {
    output,
    action: {
      target: parts[0] ?? '',
      input: parts[1] ?? '',
      parameter: parts[2] ?? '',
      delay: Number.isFinite(delay) ? delay : 0,
      timesToFire: Number.isFinite(times) && times !== 0 ? times : -1,
      id: nextActionId++,
    },
  };
}

/** A named output on an entity (m_OnTrigger …). */
export class EntityOutput {
  readonly name: string;
  readonly actions: OutputAction[] = [];

  constructor(name: string) {
    this.name = name;
  }

  add(action: OutputAction): void {
    this.actions.push(action);
  }

  get connected(): boolean {
    return this.actions.length > 0;
  }

  /**
   * SDK: CBaseEntityOutput::FireOutput. Queues every connection; finite
   * connections count down and are removed when spent.
   */
  fire(io: IoSystem, activator: Entity | null, caller: Entity | null, value = '', extraDelay = 0): void {
    const actions = this.actions;
    for (let i = 0; i < actions.length; ) {
      const a = actions[i];
      if (a.parameter === '') io.addEvent(a.target, a.input, value, a.delay + extraDelay, activator, caller);
      else io.addEvent(a.target, a.input, a.parameter, a.delay, activator, caller);
      if (a.timesToFire !== -1) {
        a.timesToFire--;
        if (a.timesToFire <= 0) {
          actions.splice(i, 1);
          continue;
        }
      }
      i++;
    }
  }
}

/** One pending input (EventQueuePrioritizedEvent_t). */
export interface QueuedEvent {
  fireTime: number;
  /** Target name (may be procedural / wildcard / a classname), or '' when `entity` is set. */
  target: string;
  entity: Entity | null;
  input: string;
  value: string;
  activator: Entity | null;
  caller: Entity | null;
}

/** What the I/O system needs from the world. */
export interface IoHost {
  /** Current simulation time (curtime). */
  now(): number;
  /** Every live entity, in id order. */
  forEachEntity(fn: (e: Entity) => void): void;
  /** The first connected player, for "!player". */
  firstPlayer(): Entity | null;
}

/** Bounds a runaway chain of zero-delay events (a relay triggering itself). */
const MAX_EVENTS_PER_SERVICE = 4096;

/** The global event queue (CEventQueue) plus name lookup. */
export class IoSystem {
  private readonly host: IoHost;
  /** Sorted by fireTime; FIFO within a time. */
  private queue: QueuedEvent[] = [];
  private readonly scratch: Entity[] = [];

  constructor(host: IoHost) {
    this.host = host;
  }

  get pending(): readonly QueuedEvent[] {
    return this.queue;
  }

  /** SDK: CEventQueue::AddEvent (by name). */
  addEvent(
    target: string,
    input: string,
    value: string,
    delay: number,
    activator: Entity | null,
    caller: Entity | null,
  ): void {
    this.insert({
      fireTime: this.host.now() + delay,
      target,
      entity: null,
      input,
      value,
      activator,
      caller,
    });
  }

  /** SDK: CEventQueue::AddEvent (direct pointer). */
  addEventTo(
    entity: Entity,
    input: string,
    value: string,
    delay: number,
    activator: Entity | null,
    caller: Entity | null,
  ): void {
    this.insert({ fireTime: this.host.now() + delay, target: '', entity, input, value, activator, caller });
  }

  private insert(ev: QueuedEvent): void {
    const q = this.queue;
    // Insert after every event due at the same time or earlier (binary search for the upper bound).
    let lo = 0;
    let hi = q.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (q[mid].fireTime <= ev.fireTime) lo = mid + 1;
      else hi = mid;
    }
    q.splice(lo, 0, ev);
  }

  /** SDK: CEventQueue::CancelEvents — drops pending events sent by `caller`. */
  cancelEventsFrom(caller: Entity): void {
    this.queue = this.queue.filter((e) => e.caller !== caller);
  }

  /** SDK: CEventQueue::CancelEventOn — drops pending `input` events aimed at `entity` directly. */
  cancelEventOn(entity: Entity, input: string): void {
    const lc = input.toLowerCase();
    this.queue = this.queue.filter((e) => !(e.entity === entity && e.input.toLowerCase() === lc));
  }

  /** Removes every pending event (round restart: CEventQueue::Clear in CleanUpMap). */
  clear(): void {
    this.queue.length = 0;
  }

  /** SDK: CEventQueue::ServiceEvents. Fires everything due by curtime. */
  service(): void {
    const now = this.host.now();
    let budget = MAX_EVENTS_PER_SERVICE;
    while (this.queue.length > 0 && this.queue[0].fireTime <= now + 1e-9 && budget-- > 0) {
      const ev = this.queue.shift()!;
      this.dispatch(ev);
    }
  }

  private dispatch(ev: QueuedEvent): void {
    const activator = ev.activator && !ev.activator.removed ? ev.activator : null;
    const caller = ev.caller && !ev.caller.removed ? ev.caller : null;
    if (ev.entity) {
      if (!ev.entity.removed) ev.entity.acceptInput(ev.input, ev.value, activator, caller);
      return;
    }
    if (ev.target === '') return;
    const targets = this.scratch;
    targets.length = 0;
    this.findByName(ev.target, caller, activator, caller, targets);
    if (targets.length === 0) this.findByClassname(ev.target, targets);
    // Copy: an input may spawn/kill entities and re-enter the scratch list.
    const list = targets.slice();
    for (const t of list) {
      if (t.removed) continue;
      t.acceptInput(ev.input, ev.value, activator, caller);
    }
  }

  /**
   * SDK: CGlobalEntityList::FindEntityByName with procedural names.
   * Supports !self, !activator, !caller, !player and a trailing `*` wildcard.
   */
  findByName(
    name: string,
    searching: Entity | null,
    activator: Entity | null,
    caller: Entity | null,
    out: Entity[],
  ): Entity[] {
    if (name === '') return out;
    if (name[0] === '!') {
      const lc = name.toLowerCase();
      let e: Entity | null = null;
      if (lc === '!self') e = searching;
      else if (lc === '!activator') e = activator;
      else if (lc === '!caller') e = caller;
      else if (lc === '!player' || lc === '!pvsplayer') e = this.host.firstPlayer();
      if (e && !e.removed) out.push(e);
      return out;
    }
    const lc = name.toLowerCase();
    if (lc.endsWith('*')) {
      const prefix = lc.slice(0, -1);
      this.host.forEachEntity((e) => {
        if (e.targetnameLower !== '' && e.targetnameLower.startsWith(prefix)) out.push(e);
      });
    } else {
      this.host.forEachEntity((e) => {
        if (e.targetnameLower === lc) out.push(e);
      });
    }
    return out;
  }

  /** SDK: CGlobalEntityList::FindEntityByClassname (with a trailing `*` wildcard). */
  findByClassname(classname: string, out: Entity[]): Entity[] {
    const lc = classname.toLowerCase();
    if (lc.endsWith('*')) {
      const prefix = lc.slice(0, -1);
      this.host.forEachEntity((e) => {
        if (e.classname.startsWith(prefix)) out.push(e);
      });
    } else {
      this.host.forEachEntity((e) => {
        if (e.classname === lc) out.push(e);
      });
    }
    return out;
  }
}
