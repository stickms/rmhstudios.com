/**
 * The calls the flag targeting panel makes (s04-20) beyond its `apiQuery` reads.
 * Client-safe: contracts only. Kept here so the panel holds no endpoint calls of its
 * own (redesign audit B4). Admin tools answer at once or fail: no retries.
 */
import { api } from '@/lib/contract/client';
import type { BodyOf } from '@/lib/contract/endpoint';
import { checkFlagApi, editFlagTargetingApi, flagHistoryApi } from '@/lib/flags/targeting.contract';

/** Add members to, or remove them from, one of a flag's two lists. */
export const editFlagTargeting = (flagKey: string, body: BodyOf<typeof editFlagTargetingApi>) =>
  api(editFlagTargetingApi, { params: { key: flagKey }, body, retries: 0 });

/** How the flag resolves for one member, and why. */
export const checkFlag = (flagKey: string, handle: string) =>
  api(checkFlagApi, { params: { key: flagKey }, query: { handle }, retries: 0 });

/** One page of the flag's history, newest first. */
export const flagHistoryPage = (flagKey: string, cursor: string | undefined, signal?: AbortSignal) =>
  api(flagHistoryApi, {
    params: { key: flagKey },
    query: cursor ? { cursor } : {},
    ...(signal ? { signal } : {}),
    retries: 0,
  });
