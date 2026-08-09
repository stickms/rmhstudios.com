/**
 * The signal bus and `signalRelay` evaluation (§6.2).
 *
 * This exists so a level author can express "both levers, within two seconds,
 * opens the gate" as *data*. Without it every puzzle variant in Castle Clatter
 * is a code change, and the parallel authoring the whole level format was
 * designed for collapses into a queue behind one engine agent.
 *
 * Evaluation is a bounded fixed-point sweep rather than a topological sort: an
 * author can and will write a relay whose output feeds its own input, and a
 * cycle should make the gate flicker, not hang the host.
 */

import type { Prop, SignalId, SignalOp } from '../types';

const MAX_PASSES = 8;

interface Relay {
  op: SignalOp;
  inputs: SignalId[];
  out: SignalId;
  delayMs: number;
  /** For `delay`: ms remaining before the pending value is published. */
  pending: boolean;
  timer: number;
  armed: boolean;
}

export interface SignalBus {
  get(id: SignalId): boolean;
  /** Sources (levers, buttons) write here; relays never do. */
  setSource(id: SignalId, value: boolean): void;
  addRelay(prop: Extract<Prop, { kind: 'signalRelay' }>): void;
  update(dtMs: number): void;
  /** Signals whose value changed in the last `update`, for `br:event`. */
  drainChanges(out: { signal: SignalId; value: boolean }[]): number;
  reset(): void;
}

export function createSignalBus(): SignalBus {
  const values = new Map<SignalId, boolean>();
  const previous = new Map<SignalId, boolean>();
  const relays: Relay[] = [];

  const get = (id: SignalId): boolean => values.get(id) === true;

  const evaluate = (relay: Relay, dtMs: number): boolean => {
    switch (relay.op) {
      case 'and': {
        for (const id of relay.inputs) if (!get(id)) return false;
        return relay.inputs.length > 0;
      }
      case 'or': {
        for (const id of relay.inputs) if (get(id)) return true;
        return false;
      }
      case 'not':
        return !get(relay.inputs[0] ?? '');
      case 'delay': {
        const want = get(relay.inputs[0] ?? '');
        if (want !== relay.armed) {
          relay.armed = want;
          relay.timer = relay.delayMs;
          relay.pending = true;
        }
        if (relay.pending) {
          relay.timer -= dtMs;
          if (relay.timer <= 0) {
            relay.pending = false;
            return relay.armed;
          }
          return get(relay.out);
        }
        return relay.armed;
      }
    }
  };

  return {
    get,
    setSource(id, value) {
      values.set(id, value);
    },
    addRelay(prop) {
      relays.push({
        op: prop.op,
        inputs: prop.inputs,
        out: prop.out,
        delayMs: prop.delayMs ?? 0,
        pending: false,
        timer: 0,
        armed: false,
      });
    },
    update(dtMs) {
      previous.clear();
      for (const [k, v] of values) previous.set(k, v);
      // A relay chain is at most a handful deep in practice; the cap is here so
      // a cyclic authoring mistake costs one flickering gate, not the host.
      for (let pass = 0; pass < MAX_PASSES; pass++) {
        let changed = false;
        for (const relay of relays) {
          // Only the first pass advances a delay timer, or an eight-pass sweep
          // would run the clock eight times as fast.
          const next = evaluate(relay, pass === 0 ? dtMs : 0);
          if (get(relay.out) !== next) {
            values.set(relay.out, next);
            changed = true;
          }
        }
        if (!changed) break;
      }
    },
    drainChanges(out) {
      let n = 0;
      for (const [k, v] of values) {
        if (previous.get(k) !== v) {
          if (n < out.length) {
            out[n].signal = k;
            out[n].value = v;
          } else {
            out.push({ signal: k, value: v });
          }
          n++;
        }
      }
      previous.clear();
      for (const [k, v] of values) previous.set(k, v);
      return n;
    },
    reset() {
      values.clear();
      previous.clear();
      for (const relay of relays) {
        relay.pending = false;
        relay.timer = 0;
        relay.armed = false;
      }
    },
  };
}
