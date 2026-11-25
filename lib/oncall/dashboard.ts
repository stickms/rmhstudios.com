// The /admin/alarms page model: what the watchdog returns, and the pure helpers
// that order and label it. Client-safe (no imports) so the page and its tests
// share one definition; the server side lives in lib/admin/api/admin.oncall.server.ts.

/** Who acked or escalated: a Discord user id, or (`via: 'web'`) an admin acting from the panel, with `name`. */
export interface ActorView {
  by: string;
  at: number;
  via?: 'web';
  name?: string;
}

/** Mirrors the watchdog's AlarmRecord (deploy/oncall-watchdog/src/engine.ts). */
export interface AlarmView {
  key: string;
  id: string;
  sev: number;
  title: string;
  detail: string;
  runbook?: string;
  source: string;
  state: 'firing' | 'resolved';
  firedAt: number;
  updatedAt: number;
  resolvedAt?: number;
  acked?: ActorView;
  escalated?: ActorView;
  pageCount: number;
}

export interface HeartbeatView {
  name: string;
  maxAgeMs: number;
  lastSeen: number | null;
}

export interface WatchdogOverview {
  now: number;
  alarms: AlarmView[];
  heartbeats: HeartbeatView[];
}

export type OncallApiResponse =
  | ({
      ok: true;
      /** Which remediations can run on this server right now, by action id (see remediations.ts). */
      remediations: Record<string, { available: boolean; reason?: string }>;
    } & WatchdogOverview)
  | {
      ok: false;
      error: 'not_configured' | 'unreachable';
    };

export const RUNBOOK_BASE = 'https://github.com/stickms/rmhstudios.com/blob/main/docs/runbooks/oncall';

/** Same rule as the watchdog's runbook button (discord.ts runbookUrl). */
export function runbookHref(a: Pick<AlarmView, 'id' | 'runbook'>): string | null {
  if (a.runbook && /^https:\/\//.test(a.runbook)) return a.runbook;
  const name = a.runbook ?? a.id;
  return /^[A-Za-z0-9._/-]+$/.test(name) ? `${RUNBOOK_BASE}/${name.replace(/\.md$/, '')}.md` : null;
}

export type AlarmPhase = 'paging' | 'acked' | 'firing' | 'resolved';

/** Paging = firing Sev1/2 nobody has acked: the thing to look at first. */
export function phaseOf(a: AlarmView): AlarmPhase {
  if (a.state === 'resolved') return 'resolved';
  if (a.acked) return 'acked';
  return a.sev <= 2 ? 'paging' : 'firing';
}

const PHASE_RANK: Record<AlarmPhase, number> = {
  paging: 0,
  acked: 1,
  firing: 2,
  resolved: 3,
};

/** Open alarms first (unacked pages on top, worst sev first), then the most recently resolved. */
export function sortAlarms(alarms: AlarmView[]): AlarmView[] {
  return [...alarms].sort(
    (a, b) =>
      PHASE_RANK[phaseOf(a)] - PHASE_RANK[phaseOf(b)] ||
      a.sev - b.sev ||
      (a.state === 'resolved' ? (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0) : a.firedAt - b.firedAt),
  );
}

export type HeartbeatHealth = 'ok' | 'late' | 'waiting';

/** `waiting` = never checked in, so the watchdog isn't watching it yet. */
export function heartbeatHealth(h: HeartbeatView, now: number): HeartbeatHealth {
  if (h.lastSeen === null) return 'waiting';
  return now - h.lastSeen > h.maxAgeMs ? 'late' : 'ok';
}

export type AlarmAction = 'ack' | 'escalate' | 'resolve';

/** What the panel may offer for an alarm right now. Resolved alarms offer nothing; Sev1 cannot escalate again. */
export function actionsFor(a: AlarmView): AlarmAction[] {
  if (a.state !== 'firing') return [];
  const out: AlarmAction[] = [];
  if (!a.acked) out.push('ack');
  if (a.sev > 1) out.push('escalate');
  out.push('resolve');
  return out;
}

export type AlarmFilter = 'open' | 'resolved' | 'all';

/** The list the filter tabs and the search box show, in triage order. */
export function filterAlarms(alarms: AlarmView[], filter: AlarmFilter, query: string): AlarmView[] {
  const q = query.trim().toLowerCase();
  return sortAlarms(alarms).filter((a) => {
    if (filter === 'open' && a.state !== 'firing') return false;
    if (filter === 'resolved' && a.state !== 'resolved') return false;
    return !q || `${a.key} ${a.title} ${a.detail} ${a.source}`.toLowerCase().includes(q);
  });
}

/** Who to show for an actor: the admin's name from the panel, otherwise the Discord user id. */
export function actorLabel(actor: ActorView): string {
  return actor.via === 'web' ? actor.name || 'an admin' : actor.by;
}
