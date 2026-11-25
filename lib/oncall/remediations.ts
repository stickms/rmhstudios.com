// What an admin can DO about an alarm from /admin/alarms, beyond acknowledging it.
//
// Client-safe registry: which actions an alarm id offers, and how each is worded.
// Execution is server-side (remediate.server.ts), which re-checks the alarm and the
// registry on every call, so this list is a menu, never an authorisation.
//
// Only actions with a safe in-process path are here. Disk clean-up, restarts and
// backups run on the host and stay with the runbooks until they have one.

export type RemediationId = 'deploy.rerun' | 'outbox.requeue-dead' | 'jobs.retry-failed';

export interface RemediationDef {
  id: RemediationId;
  /** Alarm ids (the catalog id, not the instance key) that offer it. */
  alarms: readonly string[];
  /** Needs a confirm step with the description spelled out. Every remediation does today. */
  danger: boolean;
}

export const REMEDIATIONS: readonly RemediationDef[] = [
  // D05 (auto-rolled back on alarms) is left out on purpose: re-running would ship the commit that just failed.
  { id: 'deploy.rerun', alarms: ['D01', 'D02', 'D03', 'D04'], danger: true },
  { id: 'outbox.requeue-dead', alarms: ['A15', 'B13'], danger: true },
  { id: 'jobs.retry-failed', alarms: ['A16', 'B06', 'B13'], danger: true },
];

/** The alarm id behind a key: `A07:rmhbox` → `A07`. Tickets cut with /page are `TICKET:<n>`. */
export function alarmIdOf(key: string): string {
  return key.split(':')[0] ?? key;
}

export function remediationsFor(alarmId: string): RemediationDef[] {
  return REMEDIATIONS.filter((r) => r.alarms.includes(alarmId));
}

export function isRemediationId(value: string): value is RemediationId {
  return REMEDIATIONS.some((r) => r.id === value);
}

/** Whether an action can run right now on this server (configured), and why not. */
export interface RemediationAvailability {
  available: boolean;
  reason?: string;
}
