// On-demand CPU profiling of THIS process via the V8 inspector, for the admin
// Performance page's Profiler tab.
//
// WHAT IT COSTS: nothing until used. While a profile runs V8 samples the stack
// every 1 ms (a few percent overhead on that one worker); the wait itself is a
// timer, so the event loop keeps serving requests. It profiles the worker that
// happens to receive the request — the page shows the pid so that is explicit.
//
// ONE AT A TIME per process: two overlapping Profiler sessions would corrupt each
// other's start/stop, so a second request is refused (409 at the route).

import { Session } from 'node:inspector/promises';
import type { ProfileSummary, ProfileSummaryRow } from './admin-types';

/** Thrown when a profile is already running in this process. */
export class ProfilerBusyError extends Error {
  constructor() {
    super('A CPU profile is already running in this process');
    this.name = 'ProfilerBusyError';
  }
}

/** The slice of the V8 `.cpuprofile` format the summary reads. */
export interface CpuProfile {
  nodes: Array<{
    id: number;
    callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  }>;
  startTime: number;
  endTime: number;
  samples?: number[];
  timeDeltas?: number[];
}

const SAMPLING_INTERVAL_US = 1000;
let running = false;

export function profilerBusy(): boolean {
  return running;
}

/** Profile this process for `seconds` and return the raw `.cpuprofile`. */
export async function captureCpuProfile(seconds: number): Promise<CpuProfile> {
  if (running) throw new ProfilerBusyError();
  running = true;
  const session = new Session();
  session.connect();
  try {
    await session.post('Profiler.enable');
    await session.post('Profiler.setSamplingInterval', { interval: SAMPLING_INTERVAL_US });
    await session.post('Profiler.start');
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    const { profile } = await session.post('Profiler.stop');
    return profile as unknown as CpuProfile;
  } finally {
    try {
      await session.post('Profiler.disable');
    } catch {
      /* the session may already be unusable */
    }
    session.disconnect();
    running = false;
  }
}

/**
 * Top functions by SELF time: samples attributed to the function itself, not its
 * callees. Self samples x the average sample interval (duration / samples), since
 * V8's timer is not perfectly regular. `(idle)` is reported separately, and
 * `(program)` / `(garbage collector)` stay in the table — they are real costs.
 */
export function summarizeProfile(profile: CpuProfile, topN = 30): ProfileSummary {
  const samples = profile.samples ?? [];
  const durationMs = Math.max(0, (profile.endTime - profile.startTime) / 1000);
  const perSampleMs = samples.length ? durationMs / samples.length : 0;

  const selfByNode = new Map<number, number>();
  for (const id of samples) selfByNode.set(id, (selfByNode.get(id) ?? 0) + 1);

  const byFunction = new Map<string, ProfileSummaryRow>();
  let idle = 0;
  for (const node of profile.nodes) {
    const count = selfByNode.get(node.id) ?? 0;
    if (count === 0) continue;
    const { functionName, url, lineNumber, columnNumber } = node.callFrame;
    if (functionName === '(idle)') {
      idle += count;
      continue;
    }
    // V8 line/column are 0-based; editors and DevTools show 1-based.
    const line = lineNumber + 1;
    const column = columnNumber + 1;
    const key = `${functionName}|${url}|${line}|${column}`;
    const row = byFunction.get(key);
    if (row) row.samples += count;
    else {
      byFunction.set(key, {
        functionName: functionName || '(anonymous)',
        url,
        line,
        column,
        samples: count,
        selfMs: 0,
        selfPercent: 0,
      });
    }
  }

  const top = [...byFunction.values()]
    .sort((a, b) => b.samples - a.samples)
    .slice(0, topN)
    .map((row) => ({
      ...row,
      selfMs: Math.round(row.samples * perSampleMs * 10) / 10,
      selfPercent: samples.length ? Math.round((row.samples / samples.length) * 1000) / 10 : 0,
    }));

  return {
    sampleCount: samples.length,
    durationMs: Math.round(durationMs),
    idlePercent: samples.length ? Math.round((idle / samples.length) * 1000) / 10 : 0,
    top,
  };
}
