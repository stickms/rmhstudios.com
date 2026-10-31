import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildHarness, collectMpTestLua } from './build-harness';

describe('engine harness build', () => {
  it('collects the test driver and the specs under rmh_mp_test/', () => {
    const files = collectMpTestLua().map((f) => f.path);
    for (const want of [
      'rmh_mp_test/autopilot.lua',
      'rmh_mp_test/harness.lua',
      'rmh_mp_test/json.lua',
      'rmh_mp_test/sched.lua',
      'rmh_mp_test/spec_engine.lua',
      'rmh_mp_test/specs/engine_smoke_spec.lua',
    ]) {
      expect(files).toContain(want);
    }
    expect(files.every((f) => f.startsWith('rmh_mp_test/') && f.endsWith('.lua'))).toBe(true);
  });

  it('bundles the real runtime with the test Lua inlined', async () => {
    const dir = await buildHarness();
    const app = readFileSync(path.join(dir, 'app.js'), 'utf8');
    expect(app).toContain('__balatroEngine');
    expect(app).toContain('rmh_mp_test/autopilot.lua');
    expect(app).toContain('require "rmh_mp_test.harness"');
    // The platform Lua ships in the core pack (build-game-pack.py PLATFORM_LUA), not the bundle.
    expect(app).toContain('core-pack-missing-platform');
    expect(app).not.toContain('platform layer ready');
  }, 30_000);
});
