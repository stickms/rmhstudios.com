/**
 * Persistence for the activity tracker (port of discordbot/watch_repo.go and watch_typing_repo.go):
 * the `discord_watch_*` tables. Same statements as the Go bot. This file NEVER decides who is
 * tracked — the allowlist is enforced in watch.ts before a handler reaches any of these methods.
 */
import { randomBytes } from 'node:crypto';
import {
  at,
  ms,
  msReq,
  nullable,
  num,
  type Sql,
} from '../db';
import type {
  ClientSet,
  DayRollup,
  PresenceSession,
  StatusSession,
  TypingSession,
  VoiceSession,
  WatchMessage,
} from './types';

type Row =
  Record<
    string,
    unknown
  >;

const VOICE_COLUMNS =
  '"id","discordId","guildId","channelId","channelName","joinedAt","leftAt",' +
  '"endedReason","durationSec","mutedSec","deafenedSec","streamingSec","videoSec","aloneSec",' +
  '"selfMute","selfDeaf","streaming","video","serverMute","serverDeaf","peerCount","peakPeers",' +
  '"flagsChangedAt","peersChangedAt","updatedAt"';

const STATUS_COLUMNS =
  '"id","discordId","status","desktop","mobile","web","startedAt","endedAt","durationSec","updatedAt"';

/** A Prisma-cuid-shaped id (these tables have no DB default); same shape as the Go one. */
export function newWatchId(): string {
  const nanos =
    BigInt(
      Date.now(),
    ) *
      1_000_000n +
    BigInt(
      Math.floor(
        Math.random() *
          1_000_000,
      ),
    );
  return (
    'c' +
    nanos
      .toString(
        16,
      )
      .padStart(
        16,
        '0',
      ) +
    randomBytes(
      4,
    ).toString(
      'hex',
    )
  );
}

function scanVoice(
  r: Row,
): VoiceSession {
  return {
    id: String(
      r.id,
    ),
    discordId:
      String(
        r.discordId,
      ),
    guildId:
      String(
        r.guildId,
      ),
    channelId:
      String(
        r.channelId,
      ),
    channelName:
      (r.channelName as
        | string
        | null) ??
      '',
    joinedAt:
      msReq(
        r.joinedAt,
      ),
    leftAt:
      ms(
        r.leftAt,
      ),
    endedReason:
      (r.endedReason as
        | string
        | null) ??
      '',
    durationSec:
      num(
        r.durationSec,
      ),
    mutedSec:
      num(
        r.mutedSec,
      ),
    deafenedSec:
      num(
        r.deafenedSec,
      ),
    streamingSec:
      num(
        r.streamingSec,
      ),
    videoSec:
      num(
        r.videoSec,
      ),
    aloneSec:
      num(
        r.aloneSec,
      ),
    selfMute:
      Boolean(
        r.selfMute,
      ),
    selfDeaf:
      Boolean(
        r.selfDeaf,
      ),
    streaming:
      Boolean(
        r.streaming,
      ),
    video:
      Boolean(
        r.video,
      ),
    serverMute:
      Boolean(
        r.serverMute,
      ),
    serverDeaf:
      Boolean(
        r.serverDeaf,
      ),
    peerCount:
      num(
        r.peerCount,
      ),
    peakPeers:
      num(
        r.peakPeers,
      ),
    flagsChangedAt:
      msReq(
        r.flagsChangedAt,
      ),
    peersChangedAt:
      msReq(
        r.peersChangedAt,
      ),
    heartbeatAt:
      msReq(
        r.updatedAt,
      ),
  };
}

function scanPresence(
  r: Row,
): PresenceSession {
  return {
    id: String(
      r.id,
    ),
    discordId:
      String(
        r.discordId,
      ),
    guildId:
      String(
        r.guildId,
      ),
    activityName:
      String(
        r.activityName,
      ),
    activityType:
      num(
        r.activityType,
      ),
    details:
      (r.details as
        | string
        | null) ??
      '',
    state:
      (r.state as
        | string
        | null) ??
      '',
    startedAt:
      msReq(
        r.startedAt,
      ),
    endedAt:
      ms(
        r.endedAt,
      ),
    durationSec:
      num(
        r.durationSec,
      ),
    heartbeatAt:
      msReq(
        r.updatedAt,
      ),
  };
}

function scanStatus(
  r: Row,
): StatusSession {
  return {
    id: String(
      r.id,
    ),
    discordId:
      String(
        r.discordId,
      ),
    status:
      String(
        r.status,
      ),
    clients:
      {
        desktop:
          Boolean(
            r.desktop,
          ),
        mobile:
          Boolean(
            r.mobile,
          ),
        web: Boolean(
          r.web,
        ),
      },
    startedAt:
      msReq(
        r.startedAt,
      ),
    endedAt:
      ms(
        r.endedAt,
      ),
    durationSec:
      num(
        r.durationSec,
      ),
    heartbeatAt:
      msReq(
        r.updatedAt,
      ),
  };
}

function scanTyping(
  r: Row,
): TypingSession {
  return {
    id: String(
      r.id,
    ),
    discordId:
      String(
        r.discordId,
      ),
    guildId:
      String(
        r.guildId,
      ),
    channelId:
      String(
        r.channelId,
      ),
    channelName:
      (r.channelName as
        | string
        | null) ??
      '',
    startedAt:
      msReq(
        r.startedAt,
      ),
    lastTypingAt:
      msReq(
        r.lastTypingAt,
      ),
    settledAt:
      ms(
        r.settledAt,
      ),
    durationSec:
      num(
        r.durationSec,
      ),
    sent: Boolean(
      r.sent,
    ),
  };
}

const secs =
  (
    msv: number,
  ) =>
    Math.trunc(
      msv /
        1000,
    );

/** A JSON value for a jsonb parameter; null stays SQL NULL. */
const jsonParam =
  (
    v: unknown,
  ) =>
    v ===
      null ||
    v ===
      undefined
      ? null
      : JSON.stringify(
          v,
        );

export interface LiveActivity {
  name: string;
  type: number;
  details?: string;
  state?: string;
  startedAt?: string;
}

export interface WatchSummaryRow {
  discordId: string;
  period: string;
  periodKey: string;
  headline: string;
  summary: string;
  verdict: string;
  mood: string;
  topics: string[];
  model: string;
  sourceHash: string;
}

export interface SampledMessage {
  channel: string;
  sentAt: number;
  content: string;
}

export class WatchRepo {
  constructor(
    private readonly sql: Sql,
  ) {}

  get enabled(): boolean {
    return this
      .sql
      .enabled;
  }

  // ── Voice ────────────────────────────────────────────────────────────────

  async openVoiceSession(
    discordId: string,
  ): Promise<VoiceSession | null> {
    if (
      !this
        .sql
        .enabled
    )
      return null;
    const r =
      await this.sql.one<Row>(
        `SELECT ${VOICE_COLUMNS} FROM "discord_watch_voice_session"
       WHERE "discordId"=$1 AND "leftAt" IS NULL
       ORDER BY "joinedAt" DESC LIMIT 1`,
        discordId,
      );
    return r
      ? scanVoice(
          r,
        )
      : null;
  }

  async insertVoiceSession(
    v: VoiceSession,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    v.id =
      newWatchId();
    const now =
      Date.now();
    v.heartbeatAt =
      now;
    await this.sql.exec(
      `INSERT INTO "discord_watch_voice_session"
         ("id","discordId","guildId","channelId","channelName","joinedAt",
          "selfMute","selfDeaf","streaming","video","serverMute","serverDeaf",
          "peerCount","peakPeers","flagsChangedAt","peersChangedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      v.id,
      v.discordId,
      v.guildId,
      v.channelId,
      nullable(
        v.channelName,
      ),
      at(
        v.joinedAt,
      ),
      v.selfMute,
      v.selfDeaf,
      v.streaming,
      v.video,
      v.serverMute,
      v.serverDeaf,
      v.peerCount,
      v.peakPeers,
      at(
        v.flagsChangedAt,
      ),
      at(
        v.peersChangedAt,
      ),
      at(
        now,
      ),
    );
  }

  /** Persist the mutable half; writing updatedAt is the heartbeat. */
  async saveVoiceSession(
    v: VoiceSession,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const now =
      Date.now();
    v.heartbeatAt =
      now;
    await this.sql.exec(
      `UPDATE "discord_watch_voice_session" SET
         "mutedSec"=$2,"deafenedSec"=$3,"streamingSec"=$4,"videoSec"=$5,"aloneSec"=$6,
         "selfMute"=$7,"selfDeaf"=$8,"streaming"=$9,"video"=$10,"serverMute"=$11,"serverDeaf"=$12,
         "peerCount"=$13,"peakPeers"=$14,"flagsChangedAt"=$15,"peersChangedAt"=$16,"updatedAt"=$17
       WHERE "id"=$1`,
      v.id,
      v.mutedSec,
      v.deafenedSec,
      v.streamingSec,
      v.videoSec,
      v.aloneSec,
      v.selfMute,
      v.selfDeaf,
      v.streaming,
      v.video,
      v.serverMute,
      v.serverDeaf,
      v.peerCount,
      v.peakPeers,
      at(
        v.flagsChangedAt,
      ),
      at(
        v.peersChangedAt,
      ),
      at(
        now,
      ),
    );
  }

  /** End a session at `when` (not always now: a retroactive close uses the heartbeat). */
  async closeVoiceSession(
    v: VoiceSession,
    when: number,
    reason: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const duration =
      Math.max(
        0,
        secs(
          when -
            v.joinedAt,
        ),
      );
    v.leftAt =
      when;
    v.endedReason =
      reason;
    v.durationSec =
      duration;
    await this.sql.exec(
      `UPDATE "discord_watch_voice_session" SET
         "leftAt"=$2,"endedReason"=$3,"durationSec"=$4,
         "mutedSec"=$5,"deafenedSec"=$6,"streamingSec"=$7,"videoSec"=$8,"aloneSec"=$9,
         "peerCount"=$10,"peakPeers"=$11,"flagsChangedAt"=$12,"peersChangedAt"=$13,"updatedAt"=$14
       WHERE "id"=$1`,
      v.id,
      at(
        when,
      ),
      reason,
      duration,
      v.mutedSec,
      v.deafenedSec,
      v.streamingSec,
      v.videoSec,
      v.aloneSec,
      v.peerCount,
      v.peakPeers,
      at(
        v.flagsChangedAt,
      ),
      at(
        v.peersChangedAt,
      ),
      new Date(),
    );
  }

  /** Resume rows whose heartbeat is within grace; close older ones at their heartbeat ("stale"). */
  async resumeOrCloseSessions(
    now: number,
    graceMs: number,
  ): Promise<{
    resumed: number;
    closed: number;
  }> {
    if (
      !this
        .sql
        .enabled
    )
      return {
        resumed: 0,
        closed: 0,
      };
    const cutoff =
      new Date(
        now -
          graceMs,
      );
    const nowD =
      new Date(
        now,
      );
    const voice =
      await this.sql.exec(
        `UPDATE "discord_watch_voice_session" SET
         "leftAt"="updatedAt",
         "endedReason"='stale',
         "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "joinedAt")))::int),
         "updatedAt"=$2
       WHERE "leftAt" IS NULL AND "updatedAt" < $1`,
        cutoff,
        nowD,
      );
    const statuses =
      await this.sql.exec(
        `UPDATE "discord_watch_status_session" SET
         "endedAt"="updatedAt",
         "endedReason"='stale',
         "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "startedAt")))::int),
         "updatedAt"=$2
       WHERE "endedAt" IS NULL AND "updatedAt" < $1`,
        cutoff,
        nowD,
      );
    const presence =
      await this.sql.exec(
        `UPDATE "discord_watch_presence_session" SET
         "endedAt"="updatedAt",
         "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updatedAt" - "startedAt")))::int),
         "updatedAt"=$2
       WHERE "endedAt" IS NULL AND "updatedAt" < $1`,
        cutoff,
        nowD,
      );
    const r =
      await this.sql.one<Row>(
        `SELECT (SELECT count(*) FROM "discord_watch_voice_session" WHERE "leftAt" IS NULL)
            + (SELECT count(*) FROM "discord_watch_presence_session" WHERE "endedAt" IS NULL)
            + (SELECT count(*) FROM "discord_watch_status_session" WHERE "endedAt" IS NULL) AS "resumed"`,
      );
    return {
      resumed:
        num(
          r?.resumed,
        ),
      closed:
        voice +
        presence +
        statuses,
    };
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /** ON CONFLICT DO NOTHING on messageId: a redelivery is a no-op, never a double count. */
  async insertMessage(
    m: WatchMessage,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_watch_message"
         ("id","discordId","guildId","channelId","channelName","messageId","sentAt","content",
          "charCount","wordCount","attachments","embeds","links","mentions","emoji","stickers",
          "isReply","isQuestion","isLateNight","mentionsJob")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT ("messageId") DO NOTHING`,
      newWatchId(),
      m.discordId,
      m.guildId,
      m.channelId,
      nullable(
        m.channelName,
      ),
      m.messageId,
      at(
        m.sentAt,
      ),
      nullable(
        m.content,
      ),
      m.charCount,
      m.wordCount,
      m.attachments,
      m.embeds,
      m.links,
      m.mentions,
      m.emoji,
      m.stickers,
      m.isReply,
      m.isQuestion,
      m.isLateNight,
      m.mentionsJob,
    );
  }

  async messageAuthor(
    messageId: string,
  ): Promise<{
    author: string;
    sentAt: number;
  } | null> {
    if (
      !this
        .sql
        .enabled
    )
      return null;
    const r =
      await this.sql.one<Row>(
        `SELECT "discordId","sentAt" FROM "discord_watch_message" WHERE "messageId"=$1`,
        messageId,
      );
    return r
      ? {
          author:
            String(
              r.discordId,
            ),
          sentAt:
            msReq(
              r.sentAt,
            ),
        }
      : null;
  }

  async messagesForDay(
    discordId: string,
    from: number,
    to: number,
  ): Promise<
    WatchMessage[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "channelId","channelName","sentAt","charCount","wordCount","attachments","links",
              "mentions","emoji","stickers","isReply","isQuestion","isLateNight","mentionsJob"
       FROM "discord_watch_message"
       WHERE "discordId"=$1 AND "sentAt" >= $2 AND "sentAt" < $3
       ORDER BY "sentAt"`,
        discordId,
        at(
          from,
        ),
        at(
          to,
        ),
      );
    return rows.map(
      (
        r,
      ) => ({
        discordId,
        guildId:
          '',
        channelId:
          String(
            r.channelId,
          ),
        channelName:
          (r.channelName as
            | string
            | null) ??
          '',
        messageId:
          '',
        sentAt:
          msReq(
            r.sentAt,
          ),
        content:
          '',
        charCount:
          num(
            r.charCount,
          ),
        wordCount:
          num(
            r.wordCount,
          ),
        attachments:
          num(
            r.attachments,
          ),
        embeds: 0,
        links:
          num(
            r.links,
          ),
        mentions:
          num(
            r.mentions,
          ),
        emoji:
          num(
            r.emoji,
          ),
        stickers:
          num(
            r.stickers,
          ),
        isReply:
          Boolean(
            r.isReply,
          ),
        isQuestion:
          Boolean(
            r.isQuestion,
          ),
        isLateNight:
          Boolean(
            r.isLateNight,
          ),
        mentionsJob:
          Boolean(
            r.mentionsJob,
          ),
      }),
    );
  }

  async sampleMessages(
    discordId: string,
    from: number,
    to: number,
    limit: number,
  ): Promise<
    SampledMessage[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT COALESCE("channelName","channelId") AS "channel","sentAt","content"
       FROM "discord_watch_message"
       WHERE "discordId"=$1 AND "sentAt" >= $2 AND "sentAt" < $3
         AND "content" IS NOT NULL AND "content" <> ''
       ORDER BY "sentAt" DESC LIMIT $4`,
        discordId,
        at(
          from,
        ),
        at(
          to,
        ),
        limit,
      );
    return rows.map(
      (
        r,
      ) => ({
        channel:
          String(
            r.channel,
          ),
        sentAt:
          msReq(
            r.sentAt,
          ),
        content:
          String(
            r.content,
          ),
      }),
    );
  }

  async pruneMessages(
    before: number,
  ): Promise<number> {
    if (
      !this
        .sql
        .enabled
    )
      return 0;
    return this.sql.exec(
      `DELETE FROM "discord_watch_message" WHERE "sentAt" < $1`,
      at(
        before,
      ),
    );
  }

  // ── Presence (activities) ────────────────────────────────────────────────

  async openPresenceSessions(
    discordId: string,
  ): Promise<
    PresenceSession[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "id","discordId","guildId","activityName","activityType","details","state",
              "startedAt","updatedAt"
       FROM "discord_watch_presence_session"
       WHERE "discordId"=$1 AND "endedAt" IS NULL`,
        discordId,
      );
    return rows.map(
      scanPresence,
    );
  }

  async insertPresenceSession(
    p: PresenceSession,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    p.id =
      newWatchId();
    await this.sql.exec(
      `INSERT INTO "discord_watch_presence_session"
         ("id","discordId","guildId","activityName","activityType","details","state","startedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      p.id,
      p.discordId,
      p.guildId,
      p.activityName,
      p.activityType,
      nullable(
        p.details,
      ),
      nullable(
        p.state,
      ),
      at(
        p.startedAt,
      ),
      new Date(),
    );
  }

  async closePresenceSession(
    p: PresenceSession,
    when: number,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const duration =
      Math.max(
        0,
        secs(
          when -
            p.startedAt,
        ),
      );
    await this.sql.exec(
      `UPDATE "discord_watch_presence_session"
       SET "endedAt"=$2,"durationSec"=$3,"updatedAt"=$4 WHERE "id"=$1`,
      p.id,
      at(
        when,
      ),
      duration,
      new Date(),
    );
  }

  /** End every open activity for a user (`only` narrows to one row). */
  async closeOpenPresence(
    discordId: string,
    only:
      | string
      | null,
    when: number,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    let q = `UPDATE "discord_watch_presence_session" SET
               "endedAt"=$2,
               "durationSec"=GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($2 - "startedAt")))::int),
               "updatedAt"=$3
             WHERE "discordId"=$1 AND "endedAt" IS NULL`;
    const args: unknown[] =
      [
        discordId,
        at(
          when,
        ),
        new Date(),
      ];
    if (
      only !==
      null
    ) {
      q += ` AND "id"=$4`;
      args.push(
        only,
      );
    }
    await this.sql.exec(
      q,
      ...args,
    );
  }

  async touchOpenPresence(
    discordId: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `UPDATE "discord_watch_presence_session" SET "updatedAt"=$2
       WHERE "discordId"=$1 AND "endedAt" IS NULL`,
      discordId,
      new Date(),
    );
  }

  async voiceSessionsOverlapping(
    discordId: string,
    from: number,
    to: number,
  ): Promise<
    VoiceSession[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT ${VOICE_COLUMNS} FROM "discord_watch_voice_session"
       WHERE "discordId"=$1 AND "joinedAt" < $3 AND COALESCE("leftAt", NOW()) > $2
       ORDER BY "joinedAt"`,
        discordId,
        at(
          from,
        ),
        at(
          to,
        ),
      );
    return rows.map(
      scanVoice,
    );
  }

  async presenceSessionsOverlapping(
    discordId: string,
    from: number,
    to: number,
  ): Promise<
    PresenceSession[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "id","discordId","guildId","activityName","activityType","details","state",
              "startedAt","endedAt","updatedAt"
       FROM "discord_watch_presence_session"
       WHERE "discordId"=$1 AND "startedAt" < $3 AND COALESCE("endedAt", NOW()) > $2
       ORDER BY "startedAt"`,
        discordId,
        at(
          from,
        ),
        at(
          to,
        ),
      );
    return rows.map(
      scanPresence,
    );
  }

  // ── Status sessions (time online) ────────────────────────────────────────

  async openStatusSession(
    discordId: string,
  ): Promise<StatusSession | null> {
    if (
      !this
        .sql
        .enabled
    )
      return null;
    const r =
      await this.sql.one<Row>(
        `SELECT ${STATUS_COLUMNS} FROM "discord_watch_status_session"
       WHERE "discordId"=$1 AND "endedAt" IS NULL
       ORDER BY "startedAt" DESC LIMIT 1`,
        discordId,
      );
    return r
      ? scanStatus(
          r,
        )
      : null;
  }

  async insertStatusSession(
    v: StatusSession,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    v.id =
      newWatchId();
    const now =
      Date.now();
    v.heartbeatAt =
      now;
    await this.sql.exec(
      `INSERT INTO "discord_watch_status_session"
         ("id","discordId","status","desktop","mobile","web","startedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      v.id,
      v.discordId,
      v.status,
      v
        .clients
        .desktop,
      v
        .clients
        .mobile,
      v
        .clients
        .web,
      at(
        v.startedAt,
      ),
      at(
        now,
      ),
    );
  }

  async closeStatusSession(
    v: StatusSession,
    when: number,
    reason: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const duration =
      Math.max(
        0,
        secs(
          when -
            v.startedAt,
        ),
      );
    v.endedAt =
      when;
    v.durationSec =
      duration;
    await this.sql.exec(
      `UPDATE "discord_watch_status_session"
       SET "endedAt"=$2,"durationSec"=$3,"endedReason"=$4,"updatedAt"=$5 WHERE "id"=$1`,
      v.id,
      at(
        when,
      ),
      duration,
      reason,
      new Date(),
    );
  }

  async touchOpenStatus(
    discordId: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `UPDATE "discord_watch_status_session" SET "updatedAt"=$2
       WHERE "discordId"=$1 AND "endedAt" IS NULL`,
      discordId,
      new Date(),
    );
  }

  async statusSessionsOverlapping(
    discordId: string,
    from: number,
    to: number,
  ): Promise<
    StatusSession[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT ${STATUS_COLUMNS} FROM "discord_watch_status_session"
       WHERE "discordId"=$1 AND "startedAt" < $3 AND COALESCE("endedAt", NOW()) > $2
       ORDER BY "startedAt"`,
        discordId,
        at(
          from,
        ),
        at(
          to,
        ),
      );
    return rows.map(
      scanStatus,
    );
  }

  // ── Live card ────────────────────────────────────────────────────────────

  /** status + activities (written whole) + custom status; statusChangedAt moves only on change. */
  async upsertLiveStatus(
    discordId: string,
    status: string,
    activityName: string,
    activityType:
      | number
      | null,
    activities: LiveActivity[],
    customStatus: string,
    customEmoji: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const now =
      new Date();
    await this.sql.exec(
      `INSERT INTO "discord_watch_live"
         ("discordId","status","statusChangedAt","activityName","activityType",
          "activities","customStatus","customEmoji","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$3)
       ON CONFLICT ("discordId") DO UPDATE SET
         "status"=EXCLUDED."status",
         "statusChangedAt"=CASE
           WHEN "discord_watch_live"."status" IS DISTINCT FROM EXCLUDED."status"
           THEN EXCLUDED."statusChangedAt" ELSE "discord_watch_live"."statusChangedAt" END,
         "activityName"=EXCLUDED."activityName",
         "activityType"=EXCLUDED."activityType",
         "activities"=EXCLUDED."activities",
         "customStatus"=EXCLUDED."customStatus",
         "customEmoji"=EXCLUDED."customEmoji",
         "updatedAt"=EXCLUDED."updatedAt"`,
      discordId,
      status,
      now,
      nullable(
        activityName,
      ),
      activityType,
      JSON.stringify(
        activities ??
          [],
      ),
      nullable(
        customStatus,
      ),
      nullable(
        customEmoji,
      ),
    );
  }

  /** Name + avatar, written verbatim (a dead avatar hash must be clearable). Never touches status. */
  async upsertLiveIdentity(
    discordId: string,
    username: string,
    globalName: string,
    avatarHash: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const now =
      new Date();
    await this.sql.exec(
      `INSERT INTO "discord_watch_live" ("discordId","username","globalName","avatarHash","statusChangedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$5)
       ON CONFLICT ("discordId") DO UPDATE SET
         "username"=EXCLUDED."username",
         "globalName"=EXCLUDED."globalName",
         "avatarHash"=EXCLUDED."avatarHash",
         "updatedAt"=EXCLUDED."updatedAt"`,
      discordId,
      nullable(
        username,
      ),
      nullable(
        globalName,
      ),
      nullable(
        avatarHash,
      ),
      now,
    );
  }

  // ── Day rollup ───────────────────────────────────────────────────────────

  /** Upsert one recomputed day. Never writes the two reaction counters (incremented elsewhere). */
  async writeDayRollup(
    d: DayRollup,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_watch_day"
         ("discordId","dateKey","timeZone","voiceSec","voiceSessions","longestVoiceSec","mutedSec",
          "deafenedSec","streamingSec","videoSec","aloneSec","lateNightSec","onlineSec","idleSec","dndSec",
          "desktopSec","mobileSec","webSec","messages","words",
          "characters","attachments","links","mentions","emoji","stickers","replies","questions",
          "lateNightMessages","gamingSec","gameSessions","topGame","topGameSec","topChannel",
          "topChannelMessages","hourlyMessages","hourlyVoiceSec","hourlyGamingSec","firstSeenAt","lastSeenAt",
          "jobMentions","typingStarts","typingAbandoned","typingAbandonedSec","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
               $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36::jsonb,$37::jsonb,$38::jsonb,$39,$40,$41,$42,$43,$44,$45)
       ON CONFLICT ("discordId","dateKey") DO UPDATE SET
         "timeZone"=EXCLUDED."timeZone",
         "voiceSec"=EXCLUDED."voiceSec",
         "voiceSessions"=EXCLUDED."voiceSessions",
         "longestVoiceSec"=EXCLUDED."longestVoiceSec",
         "mutedSec"=EXCLUDED."mutedSec",
         "deafenedSec"=EXCLUDED."deafenedSec",
         "streamingSec"=EXCLUDED."streamingSec",
         "videoSec"=EXCLUDED."videoSec",
         "aloneSec"=EXCLUDED."aloneSec",
         "lateNightSec"=EXCLUDED."lateNightSec",
         "onlineSec"=EXCLUDED."onlineSec",
         "idleSec"=EXCLUDED."idleSec",
         "dndSec"=EXCLUDED."dndSec",
         "desktopSec"=EXCLUDED."desktopSec",
         "mobileSec"=EXCLUDED."mobileSec",
         "webSec"=EXCLUDED."webSec",
         "messages"=EXCLUDED."messages",
         "words"=EXCLUDED."words",
         "characters"=EXCLUDED."characters",
         "attachments"=EXCLUDED."attachments",
         "links"=EXCLUDED."links",
         "mentions"=EXCLUDED."mentions",
         "emoji"=EXCLUDED."emoji",
         "stickers"=EXCLUDED."stickers",
         "replies"=EXCLUDED."replies",
         "questions"=EXCLUDED."questions",
         "lateNightMessages"=EXCLUDED."lateNightMessages",
         "gamingSec"=EXCLUDED."gamingSec",
         "gameSessions"=EXCLUDED."gameSessions",
         "topGame"=EXCLUDED."topGame",
         "topGameSec"=EXCLUDED."topGameSec",
         "topChannel"=EXCLUDED."topChannel",
         "topChannelMessages"=EXCLUDED."topChannelMessages",
         "hourlyMessages"=EXCLUDED."hourlyMessages",
         "hourlyVoiceSec"=EXCLUDED."hourlyVoiceSec",
         "hourlyGamingSec"=EXCLUDED."hourlyGamingSec",
         "firstSeenAt"=EXCLUDED."firstSeenAt",
         "lastSeenAt"=EXCLUDED."lastSeenAt",
         "jobMentions"=EXCLUDED."jobMentions",
         "typingStarts"=EXCLUDED."typingStarts",
         "typingAbandoned"=EXCLUDED."typingAbandoned",
         "typingAbandonedSec"=EXCLUDED."typingAbandonedSec",
         "updatedAt"=EXCLUDED."updatedAt"`,
      d.discordId,
      d.dateKey,
      d.timeZone,
      d.voiceSec,
      d.voiceSessions,
      d.longestVoiceSec,
      d.mutedSec,
      d.deafenedSec,
      d.streamingSec,
      d.videoSec,
      d.aloneSec,
      d.lateNightSec,
      d.onlineSec,
      d.idleSec,
      d.dndSec,
      d.desktopSec,
      d.mobileSec,
      d.webSec,
      d.messages,
      d.words,
      d.characters,
      d.attachments,
      d.links,
      d.mentions,
      d.emoji,
      d.stickers,
      d.replies,
      d.questions,
      d.lateNightMessages,
      d.gamingSec,
      d.gameSessions,
      nullable(
        d.topGame,
      ),
      d.topGameSec,
      nullable(
        d.topChannel,
      ),
      d.topChannelMessages,
      jsonParam(
        d.hourlyMessages,
      ),
      jsonParam(
        d.hourlyVoiceSec,
      ),
      jsonParam(
        d.hourlyGamingSec,
      ),
      at(
        d.firstSeenAt,
      ),
      at(
        d.lastSeenAt,
      ),
      d.jobMentions,
      d.typingStarts,
      d.typingAbandoned,
      d.typingAbandonedSec,
      new Date(),
    );
  }

  async bumpReactions(
    discordId: string,
    dateKey: string,
    timeZone: string,
    given: number,
    received: number,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `INSERT INTO "discord_watch_day" ("discordId","dateKey","timeZone","reactionsGiven","reactionsReceived","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("discordId","dateKey") DO UPDATE SET
         "reactionsGiven"="discord_watch_day"."reactionsGiven"+EXCLUDED."reactionsGiven",
         "reactionsReceived"="discord_watch_day"."reactionsReceived"+EXCLUDED."reactionsReceived",
         "updatedAt"=EXCLUDED."updatedAt"`,
      discordId,
      dateKey,
      timeZone,
      given,
      received,
      new Date(),
    );
  }

  async daysInRange(
    discordId: string,
    fromKey: string,
    toKey: string,
  ): Promise<
    DayRollup[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "dateKey","voiceSec","voiceSessions","longestVoiceSec","mutedSec","deafenedSec",
              "streamingSec","videoSec","aloneSec","lateNightSec","onlineSec","idleSec","dndSec",
              "desktopSec","mobileSec","webSec","messages","words","characters",
              "attachments","links","mentions","emoji","stickers","replies","questions",
              "lateNightMessages","reactionsGiven","reactionsReceived","gamingSec","gameSessions",
              "topGame","topGameSec","topChannel","topChannelMessages","firstSeenAt","lastSeenAt",
              "jobMentions","typingStarts","typingAbandoned","typingAbandonedSec"
       FROM "discord_watch_day"
       WHERE "discordId"=$1 AND "dateKey" >= $2 AND "dateKey" <= $3
       ORDER BY "dateKey"`,
        discordId,
        fromKey,
        toKey,
      );
    return rows.map(
      (
        r,
      ) => {
        const d: DayRollup =
          {
            discordId,
            dateKey:
              String(
                r.dateKey,
              ),
            timeZone:
              '',
            topGame:
              (r.topGame as
                | string
                | null) ??
              '',
            topChannel:
              (r.topChannel as
                | string
                | null) ??
              '',
            firstSeenAt:
              ms(
                r.firstSeenAt,
              ),
            lastSeenAt:
              ms(
                r.lastSeenAt,
              ),
            hourlyMessages:
              [],
            hourlyVoiceSec:
              [],
            hourlyGamingSec:
              [],
          } as unknown as DayRollup;
        for (const k of DAY_INT_FIELDS)
          (
            d as unknown as Record<
              string,
              number
            >
          )[
            k
          ] =
            num(
              r[
                k
              ],
            );
        return d;
      },
    );
  }

  // ── Summaries ────────────────────────────────────────────────────────────

  async summarySourceHash(
    discordId: string,
    period: string,
    periodKey: string,
  ): Promise<string> {
    if (
      !this
        .sql
        .enabled
    )
      return '';
    const r =
      await this.sql.one<Row>(
        `SELECT "sourceHash" FROM "discord_watch_summary"
       WHERE "discordId"=$1 AND "period"=$2 AND "periodKey"=$3`,
        discordId,
        period,
        periodKey,
      );
    return r
      ? String(
          r.sourceHash ??
            '',
        )
      : '';
  }

  async upsertSummary(
    s: WatchSummaryRow,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const now =
      new Date();
    await this.sql.exec(
      `INSERT INTO "discord_watch_summary"
         ("id","discordId","period","periodKey","headline","summary","verdict","mood","topics",
          "model","sourceHash","generatedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
       ON CONFLICT ("discordId","period","periodKey") DO UPDATE SET
         "headline"=EXCLUDED."headline",
         "summary"=EXCLUDED."summary",
         "verdict"=EXCLUDED."verdict",
         "mood"=EXCLUDED."mood",
         "topics"=EXCLUDED."topics",
         "model"=EXCLUDED."model",
         "sourceHash"=EXCLUDED."sourceHash",
         "generatedAt"=EXCLUDED."generatedAt",
         "updatedAt"=EXCLUDED."updatedAt"`,
      newWatchId(),
      s.discordId,
      s.period,
      s.periodKey,
      s.headline,
      s.summary,
      nullable(
        s.verdict,
      ),
      nullable(
        s.mood,
      ),
      jsonParam(
        s.topics,
      ),
      s.model,
      s.sourceHash,
      now,
      now,
    );
  }

  async unpostedWeekSummaries(
    discordId: string,
    oldestKey: string,
  ): Promise<
    WatchSummaryRow[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "periodKey","headline","summary","verdict","mood","topics"
       FROM "discord_watch_summary"
       WHERE "discordId"=$1 AND "period"='week' AND "digestPostedAt" IS NULL AND "periodKey" >= $2
       ORDER BY "periodKey"`,
        discordId,
        oldestKey,
      );
    return rows.map(
      (
        r,
      ) => ({
        discordId,
        period:
          'week',
        periodKey:
          String(
            r.periodKey,
          ),
        headline:
          String(
            r.headline ??
              '',
          ),
        summary:
          String(
            r.summary ??
              '',
          ),
        verdict:
          (r.verdict as
            | string
            | null) ??
          '',
        mood:
          (r.mood as
            | string
            | null) ??
          '',
        topics:
          Array.isArray(
            r.topics,
          )
            ? (
                r.topics as unknown[]
              ).map(
                String,
              )
            : [],
        model:
          '',
        sourceHash:
          '',
      }),
    );
  }

  /** Conditional on the column still being null — two racing workers cannot both claim. */
  async claimDigest(
    discordId: string,
    periodKey: string,
    when: number,
  ): Promise<boolean> {
    if (
      !this
        .sql
        .enabled
    )
      return false;
    const n =
      await this.sql.exec(
        `UPDATE "discord_watch_summary" SET "digestPostedAt"=$3,"updatedAt"=$4
       WHERE "discordId"=$1 AND "period"='week' AND "periodKey"=$2 AND "digestPostedAt" IS NULL`,
        discordId,
        periodKey,
        at(
          when,
        ),
        new Date(),
      );
    return (
      n >
      0
    );
  }

  async releaseDigest(
    discordId: string,
    periodKey: string,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `UPDATE "discord_watch_summary" SET "digestPostedAt"=NULL,"updatedAt"=$3
       WHERE "discordId"=$1 AND "period"='week' AND "periodKey"=$2`,
      discordId,
      periodKey,
      new Date(),
    );
  }

  // ── Typing (compose sessions) ────────────────────────────────────────────

  /** Extend the open run in this channel (UPDATE) or open a new one (INSERT). */
  async touchTypingSession(
    t: TypingSession,
    idleMs: number,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    const now =
      new Date();
    const cutoff =
      new Date(
        t.lastTypingAt -
          idleMs,
      );
    const n =
      await this.sql.exec(
        `UPDATE "discord_watch_typing_session"
       SET "lastTypingAt"=$3,"updatedAt"=$4
       WHERE "discordId"=$1 AND "channelId"=$2 AND "settledAt" IS NULL AND "lastTypingAt" >= $5`,
        t.discordId,
        t.channelId,
        at(
          t.lastTypingAt,
        ),
        now,
        cutoff,
      );
    if (
      n >
      0
    )
      return;
    t.id =
      newWatchId();
    await this.sql.exec(
      `INSERT INTO "discord_watch_typing_session"
         ("id","discordId","guildId","channelId","channelName","startedAt","lastTypingAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      t.id,
      t.discordId,
      t.guildId,
      t.channelId,
      nullable(
        t.channelName,
      ),
      at(
        t.startedAt,
      ),
      at(
        t.lastTypingAt,
      ),
      now,
    );
  }

  async settleTypingSession(
    discordId: string,
    channelId: string,
    when: number,
    sent: boolean,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `UPDATE "discord_watch_typing_session"
       SET "settledAt"=$3,
           "sent"=$4,
           "durationSec"=GREATEST(0, EXTRACT(EPOCH FROM ($3 - "startedAt"))::int),
           "updatedAt"=$5
       WHERE "discordId"=$1 AND "channelId"=$2 AND "settledAt" IS NULL`,
      discordId,
      channelId,
      at(
        when,
      ),
      sent,
      new Date(),
    );
  }

  async openTypingSessions(): Promise<
    TypingSession[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "id","discordId","guildId","channelId","channelName",
              "startedAt","lastTypingAt","settledAt","durationSec","sent"
       FROM "discord_watch_typing_session"
       WHERE "settledAt" IS NULL
       ORDER BY "startedAt"`,
      );
    return rows.map(
      scanTyping,
    );
  }

  async typingSessionsStartedIn(
    discordId: string,
    from: number,
    to: number,
  ): Promise<
    TypingSession[]
  > {
    if (
      !this
        .sql
        .enabled
    )
      return [];
    const rows =
      await this.sql.query<Row>(
        `SELECT "id","discordId","guildId","channelId","channelName",
              "startedAt","lastTypingAt","settledAt","durationSec","sent"
       FROM "discord_watch_typing_session"
       WHERE "discordId"=$1 AND "startedAt" >= $2 AND "startedAt" < $3
       ORDER BY "startedAt"`,
        discordId,
        at(
          from,
        ),
        at(
          to,
        ),
      );
    return rows.map(
      scanTyping,
    );
  }

  async purgeTypingSessions(
    before: number,
  ): Promise<void> {
    if (
      !this
        .sql
        .enabled
    )
      return;
    await this.sql.exec(
      `DELETE FROM "discord_watch_typing_session"
       WHERE "settledAt" IS NOT NULL AND "startedAt" < $1`,
      at(
        before,
      ),
    );
  }
}

/** The integer columns of discord_watch_day read back by daysInRange. */
const DAY_INT_FIELDS =
  [
    'voiceSec',
    'voiceSessions',
    'longestVoiceSec',
    'mutedSec',
    'deafenedSec',
    'streamingSec',
    'videoSec',
    'aloneSec',
    'lateNightSec',
    'onlineSec',
    'idleSec',
    'dndSec',
    'desktopSec',
    'mobileSec',
    'webSec',
    'messages',
    'words',
    'characters',
    'attachments',
    'links',
    'mentions',
    'emoji',
    'stickers',
    'replies',
    'questions',
    'lateNightMessages',
    'reactionsGiven',
    'reactionsReceived',
    'gamingSec',
    'gameSessions',
    'topGameSec',
    'topChannelMessages',
    'jobMentions',
    'typingStarts',
    'typingAbandoned',
    'typingAbandonedSec',
  ] as const;

export type { ClientSet };
