// Shapes of the admin Performance endpoints' responses, shared by the server code
// that builds them (admin.server.ts) and the page that renders them. Type-only on
// purpose: the page imports this file, and `admin.server.ts` must never reach the
// client bundle.

import type { ClusterSnapshot, ProcessSnapshot } from './process-metrics';

export type HubResult = ProcessSnapshot | { service: string; error: 'unreachable' };

export interface RedisPlaneReport {
  ping: number | null;
  info: Record<string, string | number> | null;
}

export interface PerfOverview {
  generatedAt: number;
  /** Which process answered; its entry in `processes` is the live snapshot. */
  self: { pid: number; hostname: string; service: string };
  processes: ProcessSnapshot[];
  cluster: ClusterSnapshot;
  hubs: HubResult[];
  redis: {
    enabled: boolean;
    distinct: boolean;
    cache: RedisPlaneReport | null;
    state: RedisPlaneReport | null;
  };
}

export type Row = Record<string, unknown>;

export interface DbDiagnostics {
  generatedAt: number;
  activity: Row[] | null;
  connections: Row | null;
  longestRunning: Row[] | null;
  database: (Row & { cacheHitRatio?: number | null }) | null;
  statements: { available: boolean; rows?: Row[] | null };
  tables: Row[] | null;
  seqScanHints: Row[] | null;
  unusedIndexes: Row[] | null;
  waitingLocks: number | null;
  server: Row | null;
  pool: unknown;
}

export interface ProfileSummaryRow {
  functionName: string;
  url: string;
  line: number;
  column: number;
  samples: number;
  selfMs: number;
  selfPercent: number;
}

export interface ProfileSummary {
  sampleCount: number;
  durationMs: number;
  /** Share of samples spent idle in the event loop (not a function worth fixing). */
  idlePercent: number;
  top: ProfileSummaryRow[];
}

export interface ProfileResponse extends ProfileSummary {
  pid: number;
  seconds: number;
}

export interface HeapReport {
  pid: number;
  hostname: string;
  generatedAt: number;
  heap: Record<string, number>;
  spaces: Array<{
    space_name: string;
    space_size: number;
    space_used_size: number;
    space_available_size: number;
    physical_space_size: number;
  }>;
}
