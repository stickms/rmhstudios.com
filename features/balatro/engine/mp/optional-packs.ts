/**
 * Optional content packs (EX-14): art a ruleset needs beyond the MP pack — today only `release`,
 * the Release ruleset's Joker sheet (`release-<sha>.zip`, ~1.3 MB, its own budget). Nothing
 * fetches one until a lobby (or a practice run) picks a ruleset that lists it in `packs`
 * (rulesets.ts `requiredPacks`); then every seated peer fetches it (IndexedDB cache kind
 * `release`, then the network, sha-256 verified — runtime.ts `loadPack`), mounts it under
 * rmh_mp/ and tells the host through `player_info.packs`. The host cannot start until every
 * seated player holds every required pack (lobby-reducer.ts `startBlock` → `start-packs`).
 *
 * Browser-free: the fetch and the mount are injected (index.ts wires the real ones), so the
 * session tests drive it with fakes.
 */

import type { OptionalPack } from './types';

export interface OptionalPackStore {
  /** The pack is mounted in this game. */
  has(kind: OptionalPack): boolean;
  /** Fetch and mount it once (concurrent calls share one load); false on failure (retry later). */
  ensure(kind: OptionalPack): Promise<boolean>;
  /** The kinds mounted now, sorted. */
  held(): OptionalPack[];
}

export interface OptionalPackDeps {
  /** True when the pack's marker exists (it was mounted earlier this page). */
  mounted(kind: OptionalPack): boolean;
  /** Fetch the pack's files (cache, then network). */
  fetch(kind: OptionalPack): Promise<{ name: string; data: Uint8Array }[]>;
  /** Write them into the game and the marker. */
  mount(kind: OptionalPack, files: { name: string; data: Uint8Array }[]): void;
  log?(msg: string, isError?: boolean): void;
}

export const OPTIONAL_PACKS: readonly OptionalPack[] = ['release'];

export function createOptionalPacks(deps: OptionalPackDeps): OptionalPackStore {
  const loaded = new Set<OptionalPack>();
  const loading = new Map<OptionalPack, Promise<boolean>>();
  const has = (kind: OptionalPack) => loaded.has(kind) || deps.mounted(kind);
  return {
    has,
    held: () => OPTIONAL_PACKS.filter(has),
    ensure(kind) {
      if (has(kind)) return Promise.resolve(true);
      let p = loading.get(kind);
      if (!p) {
        p = (async () => {
          try {
            const files = await deps.fetch(kind);
            deps.mount(kind, files);
            loaded.add(kind);
            deps.log?.(`[mp] ${kind} pack mounted (${files.length} files)`);
            return true;
          } catch (err) {
            deps.log?.(`[mp] ${kind} pack failed: ${err instanceof Error ? err.message : String(err)}`, true);
            return false;
          } finally {
            loading.delete(kind);
          }
        })();
        loading.set(kind, p);
      }
      return p;
    },
  };
}
