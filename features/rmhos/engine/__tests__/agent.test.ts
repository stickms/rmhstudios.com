import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGENT_TIMEOUTS, AgentClient, AgentError } from '../agent';

const ENTROPY = 'ab'.repeat(64);

function fakeVm() {
  const listeners = new Set<(c: string) => void>();
  const sent: string[] = [];
  return {
    sent,
    onSerial1(cb: (c: string) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    sendSerial1(text: string) {
      sent.push(text);
    },
    emit(text: string) {
      for (const cb of listeners) cb(text);
    },
  };
}

function make(
  overrides: {
    nonce?: () => string;
  } = {},
) {
  const vm = fakeVm();
  const agent = new AgentClient(vm, {
    now: () => 1794700000_000,
    randomBytes: (n) => new Uint8Array(n).fill(0xab),
    nonce: overrides.nonce ?? (() => 'n1'),
  });
  return {
    vm,
    agent,
  };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AgentError) return e.code;
    throw e;
  }
  return 'resolved';
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('AgentClient', () => {
  it('startSession sends the three-field SESSION and resolves on SESSION_OK', async () => {
    const { vm, agent } = make();
    const p = agent.startSession('alice');
    expect(vm.sent).toEqual([`SESSION alice 1794700000 ${ENTROPY}\n`]);
    vm.emit('RMHOS SESSION_OK\r\n');
    await expect(p).resolves.toEqual({});
  });

  it('rejects with the guest error code', async () => {
    const { vm, agent } = make();
    const p = code(agent.startSession('alice'));
    vm.emit('RMHOS ERR bad_session\n');
    expect(await p).toBe('bad_session');
  });

  it('rejects with timeout when the guest does not answer', async () => {
    const { agent } = make();
    const p = code(agent.startSession('alice'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toBe('timeout');
  });

  it('a malformed RMHOS line rejects with protocol', async () => {
    const { vm, agent } = make();
    const p = code(agent.restore());
    vm.emit('RMHOS WHAT\n');
    expect(await p).toBe('protocol');
  });

  it('restore resolves on RESTORED', async () => {
    const { vm, agent } = make();
    const p = agent.restore();
    expect(vm.sent).toEqual(['RESTORE\n']);
    vm.emit('kernel noise\nRMHOS RESTORED\n');
    await expect(p).resolves.toBeUndefined();
  });

  it('save ignores a SAVED with another nonce and resolves on its own', async () => {
    const { vm, agent } = make();
    const p = agent.save();
    expect(vm.sent).toEqual(['SAVE n1\n']);
    vm.emit('RMHOS SAVED other 5\n');
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false);
    vm.emit('RMHOS SAVED n1 2048\n');
    await expect(p).resolves.toEqual({
      bytes: 2048,
    });
  });

  it('generates a valid nonce per call by default', async () => {
    const vm = fakeVm();
    const agent = new AgentClient(vm);
    const a = agent.save();
    const first = /^SAVE ([a-z0-9_-]{1,31})\n$/i.exec(vm.sent[0] ?? '');
    expect(first).not.toBeNull();
    vm.emit(`RMHOS SAVED ${first![1]} 1\n`);
    await a;
    const b = agent.save();
    const second = /^SAVE ([a-z0-9_-]{1,31})\n$/i.exec(vm.sent[1] ?? '');
    expect(second![1]).not.toBe(first![1]);
    vm.emit(`RMHOS SAVED ${second![1]} 1\n`);
    await b;
  });

  it('rejects a second command while one is in flight, without sending it', async () => {
    const { vm, agent } = make();
    const first = agent.restore();
    expect(await code(agent.save())).toBe('busy');
    expect(vm.sent).toEqual(['RESTORE\n']);
    vm.emit('RMHOS RESTORED\n');
    await first;
    const again = agent.restore();
    vm.emit('RMHOS RESTORED\n');
    await again;
  });

  it('onPoweroff fires and can be unsubscribed', () => {
    const { vm, agent } = make();
    const cb = vi.fn();
    const off = agent.onPoweroff(cb);
    vm.emit('RMHOS POWEROFF\n');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    vm.emit('RMHOS POWEROFF\n');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('startSession reports the Linux user the guest created, from the parsed SESSION_OK', async () => {
    const { vm, agent } = make();
    const plain = agent.startSession('alice');
    vm.emit('RMHOS SESSION_OK\n');
    await expect(plain).resolves.toEqual({});
    const named = agent.startSession('alice');
    vm.emit('RMHOS SESSION_OK alice_rmh\n');
    await expect(named).resolves.toEqual({
      user: 'alice_rmh',
    });
  });

  it('saved-on-poweroff hands the byte count to its subscribers and can be unsubscribed', () => {
    const { vm, agent } = make();
    const cb = vi.fn();
    const off = agent.onSavedOnPoweroff(cb);
    vm.emit('RMHOS SAVED_ON_POWEROFF 1536\n');
    expect(cb).toHaveBeenCalledWith(1536);
    vm.emit('RMHOS SAVED_ON_POWEROFF nope\n'); // the parser turns this into a protocol error
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    vm.emit('RMHOS SAVED_ON_POWEROFF 5\n');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('RESTORE and SAVE wait up to 240 s (a big home in a slow browser tab), not 120 s', async () => {
    expect(AGENT_TIMEOUTS.restore).toBe(240_000);
    expect(AGENT_TIMEOUTS.save).toBe(240_000);
    const { vm, agent } = make();
    const restore = code(agent.restore());
    await vi.advanceTimersByTimeAsync(120_001);
    vm.emit('RMHOS RESTORED\n');
    expect(await restore).toBe('resolved');
    const save = code(agent.save());
    await vi.advanceTimersByTimeAsync(240_001);
    expect(await save).toBe('timeout');
  });

  it('never puts the entropy in an error message', async () => {
    const { vm, agent } = make();
    const p = agent.startSession('alice').catch((e: Error) => e);
    vm.emit('RMHOS ERR session\n');
    const e = (await p) as Error;
    expect(e.message).not.toContain(ENTROPY);
  });
});
