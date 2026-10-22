// @vitest-environment node
/**
 * Every module in the route-entry import graph must LOAD with its AI provider's key
 * unset. The OpenAI SDK throws "Missing credentials" when a client is constructed
 * with an empty key, `loadEntries()` imports these modules before serving any page,
 * and so one unset env var used to be a 500 on every request (the built server in
 * the eversion e2e job never came up). The convention is `|| 'missing'`
 * (lib/rmhvibe/vibe-ai.server.ts); each feature gates its calls on the env var.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

describe('xAI image clients load without XAI_API_KEY', () => {
  it.each([
    '@/lib/homes/ai-image.server',
    '@/lib/rmhark-ai/image.server',
    '@/lib/rmhark-ai/bot-avatar.server',
    '@/lib/personas/avatar.server',
  ])('%s', async (path) => {
    vi.stubEnv('XAI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.resetModules();
    await expect(import(/* @vite-ignore */ path)).resolves.toBeDefined();
    vi.unstubAllEnvs();
  });
});
