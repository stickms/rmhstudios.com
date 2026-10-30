/**
 * The match project's global setup: one stack (hub + `vite dev` against the throwaway
 * Postgres, lib/stack.ts) for every match file, started once, handed to the files with
 * vitest's provide/inject as `matchStack`. Without a stack (no DATABASE_URL and no
 * BALATRO_E2E_BASE_URL) it provides the reason instead, and the files skip — or fail,
 * with BALATRO_E2E_REQUIRE_MATCH=1 (CI).
 */
import type { TestProject } from 'vitest/node';
import { stackConfig, startStack, type RunningStack } from '../lib/stack';

export interface ProvidedStack {
  baseUrl: string | null;
  socketUrl: string | null;
  reason: string | null;
}

declare module 'vitest' {
  export interface ProvidedContext {
    matchStack: ProvidedStack;
  }
}

export default async function setup(project: TestProject) {
  const cfg = stackConfig();
  if (cfg.mode === 'unavailable') {
    project.provide('matchStack', { baseUrl: null, socketUrl: null, reason: cfg.reason });
    return;
  }
  let stack: RunningStack;
  try {
    stack = await startStack(cfg);
  } catch (e) {
    project.provide('matchStack', { baseUrl: null, socketUrl: null, reason: e instanceof Error ? e.message : String(e) });
    return;
  }
  project.provide('matchStack', { baseUrl: stack.baseUrl, socketUrl: stack.socketUrl, reason: null });
  return () => stack.close();
}
