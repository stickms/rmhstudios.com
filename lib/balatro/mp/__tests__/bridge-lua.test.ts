/**
 * Cross-process conformance (PLAN §4 WS3, §6.2 I-02): the real Lua mailbox
 * (rmh/net.lua + rmh/json.lua under lua5.1, `lua/echo.lua`) against bridge.ts
 * in polling mode on node `fs`, through a temp dir. Two processes are a harsher
 * world than the engine (where both sides share one thread): `in` can be
 * replaced while Lua reads it, so this also proves nothing is lost when the
 * mailbox only trusts acks. Needs lua5.1, like lua-specs.test.ts (no skip).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { Mailbox, type MailboxDrop, type MailboxFs } from '../bridge';

const ROOT = join(import.meta.dirname, '../../../..');
const LUA = process.env.LUA51 || 'lua5.1';
const available = (() => {
  const p = spawnSync(LUA, ['-v']);
  return !p.error && p.status === 0;
})();

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function nodeFs(): MailboxFs {
  return {
    readFile: (p) => new Uint8Array(readFileSync(p)),
    // Atomic, as MEMFS writes are from Lua's point of view.
    writeFile: (p, data) => {
      writeFileSync(`${p}.js-tmp`, data);
      renameSync(`${p}.js-tmp`, p);
    },
    unlink: (p) => unlinkSync(p),
    analyzePath: (p) => ({ exists: existsSync(p) }),
  };
}

function run(count: number, extra: (mb: Mailbox) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rmh-mailbox-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'rmh/net'), { recursive: true });
  const drops: MailboxDrop[] = [];
  const echoed: string[] = [];
  const chats: string[] = [];
  let stopPoll = false;
  const mb = new Mailbox({
    fs: nodeFs(),
    root: dir,
    hooks: null,
    onDrop: (d) => drops.push(d),
    poll: (tick) => {
      const loop = () => {
        if (stopPoll) return;
        tick();
        setImmediate(loop);
      };
      setImmediate(loop);
      return () => (stopPoll = true);
    },
  });
  mb.on('mp_log', (d) => echoed.push(d.msg));
  mb.on('ui_chat', (d) => chats.push(d.text));
  extra(mb);
  const child = spawn(LUA, [join(ROOT, 'lib/balatro/mp/__tests__/lua/echo.lua'), ROOT, dir, String(count)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (b) => (out += b));
  child.stderr.on('data', (b) => (err += b));
  const done = new Promise<{ code: number | null }>((resolve) => child.on('exit', (code) => resolve({ code })));
  return { mb, drops, echoed, chats, done, out: () => out, err: () => err, stop: () => mb.stop() };
}

describe('mailbox conformance: bridge.ts ↔ rmh/net.lua (lua5.1, two processes)', () => {
  if (!available) {
    it('needs lua5.1', () => {
      throw new Error(`lua5.1 not found ("${LUA}"); install it (apt-get install -y lua5.1) or set LUA51.`);
    });
    return;
  }

  it('1 000 messages each way keep order with no loss', async () => {
    const r = run(1000);
    for (let i = 0; i < 1000; i += 1) r.mb.send('toast', { key: String(i) });
    // Wait until everything echoed, then stop the peer.
    const until = Date.now() + 50_000;
    while ((r.echoed.length < 1000 || r.chats.length < 1000) && Date.now() < until) {
      await new Promise((res) => setTimeout(res, 10));
    }
    r.mb.send('toast', { key: 'stop' });
    const { code } = await r.done;
    await new Promise((res) => setTimeout(res, 20));
    r.stop();
    expect(code, r.err()).toBe(0);
    expect(r.echoed).toEqual(Array.from({ length: 1000 }, (_, i) => String(i)));
    expect(r.chats).toEqual(Array.from({ length: 1000 }, (_, i) => String(i + 1)));
    expect(r.drops).toEqual([]);
    const peer = JSON.parse(r.out().trim()) as { last: number; seq: number };
    expect(peer.last).toBe(1001); // every JS line applied exactly once
    expect(peer.seq).toBe(2000);
    expect(r.mb.stats.ack).toBe(1001);
  }, 60_000);

  it('carries unicode, escapes and 60 KB lines intact', async () => {
    const r = run(0);
    const name = 'Zoë 🃏 漢字  ';
    const texts = ['line1\nline2', 'quote " backslash \\ tab \t', 'é'.repeat(500), '\u0001\u001f'];
    for (const text of texts) r.mb.send('chat_line', { from: 'u1', name, text, kind: 'in' });
    const big = Array.from({ length: 200 }, (_, i) => ({ d: { pad: 'p'.repeat(240) }, i, op: 'buy' as const, t: i }));
    expect(r.mb.send('replay_feed', { pov: 'u1', events: big })).toBeGreaterThan(0);
    r.mb.send('toast', { key: 'after-big' });
    const until = Date.now() + 20_000;
    while (r.echoed.length < texts.length + 1 && Date.now() < until) await new Promise((res) => setTimeout(res, 10));
    r.mb.send('toast', { key: 'stop' });
    const { code } = await r.done;
    r.stop();
    expect(code, r.err()).toBe(0);
    // replay_feed has no handler in the peer: logged and dropped by Lua, seq still consumed.
    expect(r.echoed).toEqual([...texts.map((t) => `${name}|${t}`), 'after-big']);
  }, 30_000);
});
