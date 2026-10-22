// The alarm state machine: fire → (ack | escalate | re-page)* → resolve.
//
// One record per alarm key. Firing an already-firing alarm updates it in place
// (no duplicate page); a Sev1/Sev2 that nobody has acked is re-paged as a reply
// every REPAGE_MS; resolving edits the original message and replies under it.
// All of it runs inside one Durable Object, so an ack and a cron tick can never
// interleave and lose each other's write.

import { alertMessage, pages, replyMessage, type MessageContext, type Notifier } from './discord';
import type { DurableObjectStorageLike } from './env';

export const REPAGE_MS = 10 * 60 * 1000;
/** Resolved records are kept this long so a late button click gets a sensible answer. */
export const RESOLVED_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface AlarmInput {
  /** Catalog id, e.g. "A05". */
  id: string;
  /** Optional instance, e.g. a hub name: the alarm key becomes `A07:rmhbox`. */
  instance?: string;
  sev: number;
  title: string;
  detail?: string;
  /** Runbook file name under RUNBOOK_BASE (defaults to the id), or an absolute https URL. */
  runbook?: string;
  source: string;
}

export interface AlarmRecord {
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
  messageId?: string;
  acked?: { by: string; at: number };
  escalated?: { by: string; at: number };
  lastPageAt: number;
  pageCount: number;
}

const PREFIX = 'alarm:';
const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;

export function alarmKey(input: Pick<AlarmInput, 'id' | 'instance'>): string | null {
  const key = input.instance ? `${input.id}:${input.instance}` : input.id;
  return KEY_RE.test(key) ? key : null;
}

export function validateInput(raw: unknown): AlarmInput | string {
  if (!raw || typeof raw !== 'object') return 'body must be a JSON object';
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : undefined);
  const id = str(r.id, 40);
  const title = str(r.title, 200);
  const source = str(r.source, 100);
  const sev = typeof r.sev === 'number' && Number.isInteger(r.sev) && r.sev >= 1 && r.sev <= 5 ? r.sev : undefined;
  if (!id || !title || !source || sev === undefined) return 'id, title, source (strings) and sev (1-5) are required';
  // Sev1 is a human decision (the Escalate button), never an automated one.
  if (sev === 1) return 'sev 1 is declared by a human (Escalate button), not by an alarm';
  const input: AlarmInput = {
    id,
    sev,
    title,
    source,
    instance: str(r.instance, 40),
    detail: typeof r.detail === 'string' ? r.detail.slice(0, 3500) : undefined,
    runbook: str(r.runbook, 300),
  };
  if (!alarmKey(input)) return 'id/instance may only contain letters, digits and _ . : -';
  return input;
}

export class Engine {
  constructor(
    private readonly storage: DurableObjectStorageLike,
    private readonly notifier: Notifier,
    private readonly ctx: MessageContext,
  ) {}

  get(key: string): Promise<AlarmRecord | undefined> {
    return this.storage.get<AlarmRecord>(PREFIX + key);
  }

  private save(rec: AlarmRecord): Promise<void> {
    return this.storage.put(PREFIX + rec.key, rec);
  }

  async list(): Promise<AlarmRecord[]> {
    return [...(await this.storage.list<AlarmRecord>({ prefix: PREFIX })).values()];
  }

  async fire(input: AlarmInput, now: number): Promise<AlarmRecord> {
    const key = alarmKey(input);
    if (!key) throw new Error('invalid alarm key');
    const existing = await this.get(key);

    if (existing?.state === 'firing') {
      const worse = input.sev < existing.sev && !existing.escalated;
      const rec: AlarmRecord = {
        ...existing,
        title: input.title,
        detail: input.detail ?? existing.detail,
        runbook: input.runbook ?? existing.runbook,
        sev: existing.escalated ? existing.sev : Math.min(existing.sev, input.sev),
        updatedAt: now,
      };
      if (worse && pages(rec.sev)) {
        // Got worse into paging territory: page now, and an earlier ack no longer covers it.
        rec.acked = undefined;
        rec.lastPageAt = now;
        rec.pageCount += 1;
      }
      // Sources re-fire every check while the problem lasts; only touch Discord
      // when what the message shows (title / sev) actually changed.
      const visible = rec.title !== existing.title || rec.sev !== existing.sev;
      if (rec.messageId && visible) await this.notifier.edit(rec.messageId, alertMessage(rec, this.ctx));
      if (worse && pages(rec.sev)) {
        await this.notifier.post(replyMessage(rec.messageId, `<@&${this.ctx.roleId}> worsened to **SEV${rec.sev}**`, [this.ctx.roleId]));
      }
      await this.save(rec);
      return rec;
    }

    const rec: AlarmRecord = {
      key,
      id: input.id,
      sev: input.sev,
      title: input.title,
      detail: input.detail ?? '',
      runbook: input.runbook,
      source: input.source,
      state: 'firing',
      firedAt: now,
      updatedAt: now,
      lastPageAt: now,
      pageCount: pages(input.sev) ? 1 : 0,
    };
    rec.messageId = (await this.notifier.post(alertMessage(rec, this.ctx))) ?? undefined;
    await this.save(rec);
    return rec;
  }

  async resolve(key: string, now: number, note?: string): Promise<AlarmRecord | undefined> {
    const rec = await this.get(key);
    if (!rec || rec.state !== 'firing') return rec;
    rec.state = 'resolved';
    rec.resolvedAt = now;
    rec.updatedAt = now;
    if (rec.messageId) await this.notifier.edit(rec.messageId, alertMessage(rec, this.ctx));
    const minutes = Math.max(1, Math.round((now - rec.firedAt) / 60_000));
    await this.notifier.post(replyMessage(rec.messageId, `✅ **Resolved** after ${minutes}m${note ? ` — ${note}` : ''} · \`${rec.key}\``));
    await this.save(rec);
    return rec;
  }

  /** Returns the updated record, or a reason the click was refused. */
  async ack(key: string, userId: string, now: number): Promise<AlarmRecord | string> {
    const rec = await this.get(key);
    if (!rec) return 'That alarm no longer exists.';
    if (rec.state !== 'firing') return 'Already resolved — nothing to acknowledge.';
    if (rec.acked) return `Already acknowledged by <@${rec.acked.by}>.`;
    rec.acked = { by: userId, at: now };
    rec.updatedAt = now;
    await this.save(rec);
    return rec;
  }

  async escalate(key: string, userId: string, now: number): Promise<AlarmRecord | string> {
    const rec = await this.get(key);
    if (!rec) return 'That alarm no longer exists.';
    if (rec.state !== 'firing') return 'Already resolved — nothing to escalate.';
    if (rec.sev === 1) return 'Already Sev1.';
    rec.sev = 1;
    rec.escalated = { by: userId, at: now };
    // A Sev1 is a new, bigger incident: it pages again until someone acks it.
    rec.acked = undefined;
    rec.lastPageAt = now;
    rec.pageCount += 1;
    rec.updatedAt = now;
    await this.save(rec);
    return rec;
  }

  /** Post the reply that goes with an escalation (kept separate so the click response stays fast). */
  async announceEscalation(rec: AlarmRecord): Promise<void> {
    const roles = [this.ctx.roleId, ...(this.ctx.escalationRoleId ? [this.ctx.escalationRoleId] : [])];
    const mentions = roles.map((r) => `<@&${r}>`).join(' ');
    await this.notifier.post(
      replyMessage(rec.messageId, `🔺 ${mentions} **Escalated to SEV1** by <@${rec.escalated?.by}> — all hands.`, roles),
    );
  }

  /** Cron: re-page every unacked paging alarm whose last page is REPAGE_MS old; prune old resolved records. */
  async tick(now: number): Promise<void> {
    for (const rec of await this.list()) {
      if (rec.state === 'resolved') {
        if (now - (rec.resolvedAt ?? rec.updatedAt) > RESOLVED_RETENTION_MS) await this.storage.delete(PREFIX + rec.key);
        continue;
      }
      if (!pages(rec.sev) || rec.acked || now - rec.lastPageAt < REPAGE_MS) continue;
      rec.lastPageAt = now;
      rec.pageCount += 1;
      await this.save(rec);
      const minutes = Math.round((now - rec.firedAt) / 60_000);
      await this.notifier.post(
        replyMessage(
          rec.messageId,
          `<@&${this.ctx.roleId}> still firing and **unacknowledged** after ${minutes}m (page #${rec.pageCount}) · \`${rec.key}\``,
          [this.ctx.roleId],
        ),
      );
    }
  }
}
