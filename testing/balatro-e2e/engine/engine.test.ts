/**
 * Lua L2: in-engine specs in the real love.wasm (PLAN §6.1), project `engine`:
 *
 *   pnpm test:balatro:e2e --project engine
 *
 * Boots the harness page (no DB, no hub; testing/balatro-e2e/engine/page) against
 * the committed core pack, runs every lib/balatro/lua/mp_test/specs/*_spec.lua
 * inside the engine, then boots a second, fresh browser context and checks the
 * reports that must be identical across boots (a vanilla seed's first shop).
 * Needs Chromium (Playwright's, or CHROME_PATH) — it fails, never skips, without it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  openEngine,
  startEngineStack,
  type EnginePage,
  type EngineStack,
} from '../lib/engine-driver';
import { toTap, type SpecSummary } from '../lib/channel';

let stack: EngineStack;
let first: EnginePage;
let summary: SpecSummary;

beforeAll(async () => {
  stack = await startEngineStack();
  first = await openEngine(stack.browser, stack.server.url);
}, 300_000);

afterAll(async () => {
  await first?.close().catch(() => {});
  await stack?.close();
});

describe('engine-spec harness', () => {
  it('boots the shipped core pack to the main menu with the harness installed', async () => {
    expect(first.version).toBe('1.0.1o-FULL');
    expect(await first.call('ping')).toBe('pong');
    const specs = await first.call<string[]>('list_specs');
    expect(specs).toContain('engine_smoke_spec');
  });

  it('runs every in-engine spec green', async () => {
    summary = await first.runSpecs();
    process.stdout.write(`${toTap(summary)}\n`);
    expect(summary.tests.length).toBeGreaterThan(0);
    expect(summary.tests.filter((t) => !t.ok).map((t) => `${t.name}: ${t.msg}`)).toEqual([]);
    expect(summary.failed).toBe(0);
  }, 600_000);

  it('the first boot saw no Lua crash and no page errors', async () => {
    const s = await first.pageState();
    expect(s.status).toBe('ready');
    expect(first.errors.filter((e) => !/favicon|AudioContext|audio/i.test(e))).toEqual([]);
  });

  it('a vanilla seed deals the same first shop in a second, fresh boot', async () => {
    const shop = summary?.reports.first_shop;
    expect(typeof shop).toBe('string');
    // One software-rendered page at a time: the first boot has done its part.
    await first.close();
    const second = await openEngine(stack.browser, stack.server.url);
    try {
      const again = await second.runSpecs({
        files: ['engine_smoke_spec'],
        filter: 'deterministically',
      });
      process.stdout.write(`${toTap(again)}\n`);
      expect(again.tests.filter((t) => !t.ok).map((t) => `${t.name}: ${t.msg}`)).toEqual([]);
      expect(again.passed).toBe(1);
      expect(again.reports.first_shop).toBe(shop);
    } finally {
      await second.close();
    }
  }, 600_000);
});
