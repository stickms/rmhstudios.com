/**
 * The activity tracker behind /sohumtracker (port of discordbot/watch.go, watch_voicesync.go,
 * watch_presencesync.go, watch_status.go and watch_typing.go). Read the Go file headers for the
 * full design; the load-bearing rules, kept exactly:
 *
 *   - WHO: an explicit allowlist (DISCORD_WATCH_USER_IDS), checked at the TOP of every handler.
 *     Nothing about anybody else reaches the database.
 *   - TIME: raw open/close rows are the truth; day rollups are RECOMPUTED from them. Only the
 *     mid-session toggles (mute/deafen/stream/video/alone) are banked incrementally, at each flip.
 *   - RESTARTS: every open row carries its own heartbeat (updatedAt, beaten every flush). At start,
 *     a row whose beat is within DISCORD_WATCH_GAP_GRACE is resumed; older rows close at their
 *     beat as "stale". Reconcile (on guild sync) then confirms or retroactively retires them.
 *   - NOTHING DEPENDS ON AN EVENT ARRIVING: every tick re-derives voice, peers and presence from the
 *     gateway state cache (adopt when unknown; close voice only after 3 consecutive misses), so a
 *     missed transition self-heals within minutes. Messages and reactions have no recovery path.
 *
 * Every public handler serialises on one async mutex; the private helpers assume it is held and
 * never take it again (the Go mutex was not reentrant either).
 */
import { getBool, getCSV, getDuration, getInt, getString } from '../config';
import type { DiscordPort, Message } from '../discord';
import { Mutex } from '../mutex';
import type { Activity, ClientStatus, GatewayState, Presence, PresenceUser } from '../state';
import { dateKeyIn, isValidTimeZone, localMidnight } from '../tz';
import { analyzeMessage, isLateNight, matchesJobHunt, truncateRunes } from './analyze';
import type { LiveActivity, WatchRepo } from './repo';
import { PLAYING_ACTIVITY_TYPES, buildDayRollup, dayBounds } from './rollup';
import type { ClientSet, StatusSession, VoiceSession } from './types';

/** The account the dossier was built for (a default, replaced by DISCORD_WATCH_USER_IDS). */
export const DEFAULT_WATCH_USER_ID = '169194892269060096';
const CONTENT_LIMIT = 500;
const BACKFILL_ROLLUPS_MAX = 60;
/** Consecutive sweeps that must agree he left before an open voice row is closed. */
export const VOICE_CLOSE_AFTER_MISSES = 3;
/** A compose run stays open this long after the last TYPING_START. */
export const TYPING_IDLE_WINDOW_MS = 30_000;
const DAY_MS = 86_400_000;

export interface WatchConfig {
  userIds: string[];
  timeZone: string;
  storeContent: boolean;
  retentionDays: number;
  flushIntervalMs: number;
  gapGraceMs: number;
  digestChannelId: string;
  siteURL: string;
}

/** DISCORD_WATCH_* (defaults as in Go; "none"/"off"/"disabled" turns tracking off). */
export function loadWatchConfig(env: Record<string, string | undefined> = process.env): WatchConfig {
  let ids = getCSV('DISCORD_WATCH_USER_IDS', env);
  if (ids.length === 0) ids = [DEFAULT_WATCH_USER_ID];
  if (ids.length === 1 && ['none', 'off', 'disabled'].includes(ids[0]!.trim().toLowerCase())) ids = [];
  return {
    userIds: ids,
    timeZone: getString('DISCORD_WATCH_TIMEZONE', 'America/New_York', env),
    storeContent: getBool('DISCORD_WATCH_STORE_CONTENT', true, env),
    retentionDays: getInt('DISCORD_WATCH_RETENTION_DAYS', 45, env),
    flushIntervalMs: getDuration('DISCORD_WATCH_FLUSH_INTERVAL', 60_000, env),
    gapGraceMs: getDuration('DISCORD_WATCH_GAP_GRACE', 10 * 60_000, env),
    digestChannelId: getString('DISCORD_WATCH_DIGEST_CHANNEL_ID', '', env),
    siteURL: getString('SITE_URL', getString('VITE_BETTER_AUTH_URL', 'https://rmhstudios.com', env), env).replace(/\/+$/, ''),
  };
}

export interface WatchLogger {
  info(f: { event: string; [k: string]: unknown }): void;
  warn(f: { event: string; [k: string]: unknown }): void;
  error(f: { event: string; [k: string]: unknown }): void;
}

/** What a presence handler needs (an event or a cached presence). */
export interface PresenceInput {
  user: PresenceUser | null;
  guildId: string;
  status: string;
  activities: Activity[];
  clientStatus: ClientStatus;
}

export function presenceFromCache(p: Presence, guildId: string): PresenceInput {
  return { user: p.user, guildId, status: p.status, activities: p.activities, clientStatus: p.clientStatus };
}

/** Any status counts as signed in on that client; only an empty one means "not here". */
export function clientsFrom(cs: ClientStatus): ClientSet {
  return { desktop: !!cs.desktop, mobile: !!cs.mobile, web: !!cs.web };
}

const anyClient = (c: ClientSet) => c.desktop || c.mobile || c.web;
const sameClients = (a: ClientSet, b: ClientSet) => a.desktop === b.desktop && a.mobile === b.mobile && a.web === b.web;

export function activityKey(name: string, type: number): string {
  return name.trim().toLowerCase() + '\x00' + type;
}

const secs = (ms: number) => Math.trunc(ms / 1000);

/** Bank elapsed time to whichever toggles were on since the last flip; idempotent. */
export function bankFlags(s: VoiceSession, now: number): void {
  const d = secs(now - s.flagsChangedAt);
  if (d > 0) {
    if (s.selfMute || s.serverMute) s.mutedSec += d;
    if (s.selfDeaf || s.serverDeaf) s.deafenedSec += d;
    if (s.streaming) s.streamingSec += d;
    if (s.video) s.videoSec += d;
  }
  s.flagsChangedAt = now;
}

/** Bank time alone in the channel, then record the new company (peak only rises). */
export function bankPeers(s: VoiceSession, now: number, peers: number): void {
  const d = secs(now - s.peersChangedAt);
  if (d > 0 && s.peerCount === 0) s.aloneSec += d;
  s.peersChangedAt = now;
  s.peerCount = peers;
  if (peers > s.peakPeers) s.peakPeers = peers;
}

interface VoiceInput {
  userId: string;
  guildId: string;
  channelId: string;
  selfMute: boolean;
  selfDeaf: boolean;
  selfStream: boolean;
  selfVideo: boolean;
  mute: boolean;
  deaf: boolean;
}

export class WatchService {
  readonly cfg: WatchConfig;
  readonly tz: string;
  private readonly watched: Set<string>;
  private readonly voiceMisses = new Map<string, number>();
  private readonly mu = new Mutex();

  private constructor(
    cfg: WatchConfig,
    private readonly repo: WatchRepo,
    private readonly state: GatewayState,
    private readonly port: DiscordPort,
    private readonly logger: WatchLogger,
  ) {
    this.cfg = cfg;
    let tz = cfg.timeZone;
    if (!isValidTimeZone(tz)) {
      // ERROR, not warn: day boundaries in UTC are WRONG data for a non-UTC subject.
      logger.error({ event: 'discord_bot.watch_unknown_timezone', timeZone: tz });
      tz = 'UTC';
    }
    this.tz = tz;
    this.watched = new Set(cfg.userIds);
  }

  /** null when the allowlist is empty (every call site treats that as a no-op). */
  static create(
    cfg: WatchConfig,
    repo: WatchRepo,
    state: GatewayState,
    port: DiscordPort,
    logger: WatchLogger,
  ): WatchService | null {
    return cfg.userIds.length > 0 ? new WatchService(cfg, repo, state, port, logger) : null;
  }

  tracks(userId: string): boolean {
    return userId !== '' && this.watched.has(userId);
  }

  dateKey(ms: number): string {
    return dateKeyIn(ms, this.tz);
  }

  private gapGrace(): number {
    return this.cfg.gapGraceMs > 0 ? this.cfg.gapGraceMs : 10 * 60_000;
  }

  private warn(event: string, err: unknown, extra: Record<string, unknown> = {}): void {
    this.logger.warn({ event, ...extra, err: err instanceof Error ? err.message : String(err) });
  }

  // ── Startup ──────────────────────────────────────────────────────────────

  /** Settle what the previous run left open, then identities + the rollup backfill (async). */
  async start(): Promise<void> {
    try {
      const { resumed, closed } = await this.repo.resumeOrCloseSessions(Date.now(), this.gapGrace());
      if (resumed > 0 || closed > 0) this.logger.info({ event: 'discord_bot.watch_previous_sessions', resumed, closedStale: closed });
    } catch (err) {
      this.warn('discord_bot.watch_reconcile_previous_failed', err);
    }
    void this.refreshIdentities();
    void this.backfillRollups();
  }

  /** Recompute recent days once (bounded inside message retention, so it can never zero history). */
  async backfillRollups(): Promise<void> {
    let days = this.cfg.retentionDays - 1;
    if (days > BACKFILL_ROLLUPS_MAX) days = BACKFILL_ROLLUPS_MAX;
    if (days < 1) return;
    const now = Date.now();
    let repaired = 0;
    for (const id of this.cfg.userIds) {
      try {
        await this.mu.run(() => this.recomputeSpan(id, now - days * DAY_MS, now - DAY_MS));
        repaired++;
      } catch (err) {
        this.warn('discord_bot.watch_rollup_backfill_failed', err, { userId: id });
      }
    }
    if (repaired > 0) this.logger.info({ event: 'discord_bot.watch_rollups_recomputed', users: repaired, days });
  }

  /** One flush tick: settle typing, sync voice + presence + peers from state, beat, recompute. */
  async flush(): Promise<void> {
    await this.mu.run(async () => {
      const now = Date.now();
      await this.sweepTyping(now);
      await this.syncVoiceFromState(now);
      await this.syncPresenceFromState(now);
      await this.refreshPeers('', now);
      for (const id of this.cfg.userIds) {
        await this.beat(id, now);
        for (const key of [this.dateKey(now), this.dateKey(now - DAY_MS)]) {
          await this.recomputeDay(id, key).catch((err) =>
            this.warn('discord_bot.watch_recompute_failed', err, { userId: id, dateKey: key }),
          );
        }
      }
    });
  }

  private async beat(discordId: string, now: number): Promise<void> {
    await this.repo.touchOpenPresence(discordId).catch((e) => this.warn('discord_bot.watch_presence_heartbeat_failed', e));
    await this.repo.touchOpenStatus(discordId).catch((e) => this.warn('discord_bot.watch_status_heartbeat_failed', e));
    let sess: VoiceSession | null;
    try {
      sess = await this.repo.openVoiceSession(discordId);
    } catch {
      return;
    }
    if (!sess) return;
    bankFlags(sess, now);
    bankPeers(sess, now, sess.peerCount);
    try {
      await this.repo.saveVoiceSession(sess);
    } catch (err) {
      return this.warn('discord_bot.watch_heartbeat_failed', err, { userId: discordId });
    }
    await this.repo.touchOpenPresence(discordId).catch((e) => this.warn('discord_bot.watch_presence_heartbeat_failed', e));
  }

  /** Shutdown is an observed boundary: close everything at now and bank the last stretch. */
  async closeAll(reason: string): Promise<void> {
    await this.mu.run(async () => {
      const now = Date.now();
      for (const id of this.cfg.userIds) {
        try {
          const sess = await this.repo.openVoiceSession(id);
          if (sess) {
            bankFlags(sess, now);
            bankPeers(sess, now, sess.peerCount);
            await this.repo.closeVoiceSession(sess, now, reason);
          }
        } catch (err) {
          this.warn('discord_bot.watch_close_voice_failed', err);
        }
        await this.repo.closeOpenPresence(id, null, now).catch((e) => this.warn('discord_bot.watch_close_presence_failed', e));
        try {
          const open = await this.repo.openStatusSession(id);
          if (open) await this.repo.closeStatusSession(open, now, reason);
        } catch (err) {
          this.warn('discord_bot.watch_close_status_failed', err);
        }
        await this.recomputeDay(id, this.dateKey(now)).catch((e) => this.warn('discord_bot.watch_recompute_failed', e));
      }
    });
  }

  // ── Voice ────────────────────────────────────────────────────────────────

  /** Every user's voice update (someone else joining decides whether he is alone). State already applied. */
  async handleVoiceState(e: VoiceInput): Promise<void> {
    await this.mu.run(async () => {
      const now = Date.now();
      if (this.tracks(e.userId)) {
        await this.applyVoice(e, now).catch((err) => this.warn('discord_bot.watch_voice_transition_failed', err, { userId: e.userId }));
      }
      await this.refreshPeers(e.guildId, now);
    });
  }

  private async applyVoice(e: VoiceInput, now: number): Promise<void> {
    const open = await this.repo.openVoiceSession(e.userId);
    if (e.channelId === '') {
      if (!open) return;
      bankFlags(open, now);
      bankPeers(open, now, open.peerCount);
      await this.repo.closeVoiceSession(open, now, 'leave');
      return this.recomputeSpan(e.userId, open.joinedAt, now);
    }
    if (open && open.channelId !== e.channelId) {
      bankFlags(open, now);
      bankPeers(open, now, open.peerCount);
      await this.repo.closeVoiceSession(open, now, 'move');
      await this.recomputeSpan(e.userId, open.joinedAt, now);
      return this.startVoice(e, now);
    }
    if (!open) return this.startVoice(e, now);
    bankFlags(open, now);
    open.selfMute = e.selfMute;
    open.selfDeaf = e.selfDeaf;
    open.streaming = e.selfStream;
    open.video = e.selfVideo;
    open.serverMute = e.mute;
    open.serverDeaf = e.deaf;
    await this.repo.saveVoiceSession(open);
  }

  private async startVoice(e: VoiceInput, now: number): Promise<void> {
    const peers = this.state.countVoicePeers(e.guildId, e.channelId, e.userId);
    const sess: VoiceSession = {
      id: '',
      discordId: e.userId,
      guildId: e.guildId,
      channelId: e.channelId,
      channelName: this.state.channelName(e.channelId),
      joinedAt: now,
      leftAt: null,
      endedReason: '',
      durationSec: 0,
      mutedSec: 0,
      deafenedSec: 0,
      streamingSec: 0,
      videoSec: 0,
      aloneSec: 0,
      selfMute: e.selfMute,
      selfDeaf: e.selfDeaf,
      streaming: e.selfStream,
      video: e.selfVideo,
      serverMute: e.mute,
      serverDeaf: e.deaf,
      peerCount: peers,
      peakPeers: peers,
      flagsChangedAt: now,
      peersChangedAt: now,
      heartbeatAt: now,
    };
    await this.repo.insertVoiceSession(sess);
    await this.recomputeDay(e.userId, this.dateKey(now));
  }

  /** Re-count company and bank alone time; guildId "" = every guild (the recovery path). */
  private async refreshPeers(guildId: string, now: number): Promise<void> {
    for (const id of this.watched) {
      let sess: VoiceSession | null;
      try {
        sess = await this.repo.openVoiceSession(id);
      } catch {
        continue;
      }
      if (!sess) continue;
      if (guildId && sess.guildId !== guildId) continue;
      const peers = this.state.countVoicePeers(sess.guildId, sess.channelId, id);
      if (peers === sess.peerCount) continue;
      bankPeers(sess, now, peers);
      await this.repo.saveVoiceSession(sess).catch((e) => this.warn('discord_bot.watch_peer_update_failed', e, { userId: id }));
    }
  }

  /** Make open voice rows match the gateway state (adopt missed joins; close after 3 misses). Lock held. */
  private async syncVoiceFromState(now: number): Promise<void> {
    for (const id of this.watched) {
      const live = this.state.lookupVoiceState(id);
      let open: VoiceSession | null;
      try {
        open = await this.repo.openVoiceSession(id);
      } catch (err) {
        this.warn('discord_bot.watch_voice_sync_lookup_failed', err, { userId: id });
        continue;
      }
      if (live) this.voiceMisses.delete(id);
      if (!live && !open) {
        this.voiceMisses.delete(id);
        continue;
      }
      if (!live && open) {
        if (!this.state.knowsGuild(open.guildId)) continue; // silence is not evidence of absence
        const misses = (this.voiceMisses.get(id) ?? 0) + 1;
        this.voiceMisses.set(id, misses);
        if (misses < VOICE_CLOSE_AFTER_MISSES) continue;
        this.voiceMisses.delete(id);
        bankFlags(open, now);
        bankPeers(open, now, open.peerCount);
        try {
          await this.repo.closeVoiceSession(open, now, 'sync');
        } catch (err) {
          this.warn('discord_bot.watch_voice_sync_close_failed', err, { userId: id });
          continue;
        }
        this.logger.info({ event: 'discord_bot.watch_closed_ended_voice', userId: id, channelId: open.channelId });
        await this.recomputeSpan(id, open.joinedAt, now).catch((e) => this.warn('discord_bot.watch_voice_sync_recompute_failed', e));
        continue;
      }
      if (live && !open) {
        try {
          await this.startVoice(live, now);
        } catch (err) {
          this.warn('discord_bot.watch_voice_sync_open_failed', err, { userId: id });
          continue;
        }
        this.logger.info({ event: 'discord_bot.watch_adopted_voice', userId: id, channelId: live.channelId });
        continue;
      }
      if (live && open && open.channelId !== live.channelId) {
        bankFlags(open, now);
        bankPeers(open, now, open.peerCount);
        try {
          await this.repo.closeVoiceSession(open, now, 'move');
        } catch (err) {
          this.warn('discord_bot.watch_voice_sync_move_close_failed', err, { userId: id });
          continue;
        }
        await this.startVoice(live, now).catch((e) => this.warn('discord_bot.watch_voice_sync_move_open_failed', e, { userId: id }));
        continue;
      }
      if (live && open) {
        if (
          open.selfMute === live.selfMute &&
          open.selfDeaf === live.selfDeaf &&
          open.streaming === live.selfStream &&
          open.video === live.selfVideo &&
          open.serverMute === live.mute &&
          open.serverDeaf === live.deaf
        ) {
          continue;
        }
        bankFlags(open, now);
        open.selfMute = live.selfMute;
        open.selfDeaf = live.selfDeaf;
        open.streaming = live.selfStream;
        open.video = live.selfVideo;
        open.serverMute = live.mute;
        open.serverDeaf = live.deaf;
        await this.repo.saveVoiceSession(open).catch((e) => this.warn('discord_bot.watch_voice_sync_flags_failed', e, { userId: id }));
      }
    }
  }

  /** Adopt a presence the events never delivered; otherwise only refresh the live card. Lock held. */
  private async syncPresenceFromState(now: number): Promise<void> {
    for (const id of this.watched) {
      const found = this.state.lookupPresence(id);
      if (!found) continue; // "not told", not "offline"
      const event = presenceFromCache(found.presence, found.guildId);
      if (!event.user || event.status.trim() === '') continue;
      let open: StatusSession | null;
      try {
        open = await this.repo.openStatusSession(id);
      } catch (err) {
        this.warn('discord_bot.watch_presence_sync_lookup_failed', err, { userId: id });
        continue;
      }
      if (!open) {
        await this.applyPresence(event, now);
        if (event.status.trim() !== 'offline') {
          this.logger.info({ event: 'discord_bot.watch_adopted_presence', userId: id, status: event.status });
        }
        continue;
      }
      await this.recordLiveStatus(event);
    }
  }

  /**
   * Settle open rows against a guild sync (lock taken here): resume held → nothing; moved →
   * close + open; gone → close RETROACTIVELY at the heartbeat. Presence settles the same way.
   */
  async reconcile(guildId: string): Promise<void> {
    const guild = this.state.guild(guildId);
    if (!guild) return;
    await this.mu.run(async () => {
      const now = Date.now();
      const present = new Set<string>();
      for (const vs of guild.voiceStates.values()) {
        if (!this.tracks(vs.userId) || !vs.channelId) continue;
        present.add(vs.userId);
        let open: VoiceSession | null;
        try {
          open = await this.repo.openVoiceSession(vs.userId);
        } catch (err) {
          this.warn('discord_bot.watch_reconcile_lookup_failed', err, { userId: vs.userId });
          continue;
        }
        if (open && open.channelId === vs.channelId) continue;
        if (open) {
          bankFlags(open, now);
          bankPeers(open, now, open.peerCount);
          await this.repo.closeVoiceSession(open, now, 'move').catch((e) => this.warn('discord_bot.watch_reconcile_close_failed', e));
        }
        await this.startVoice({ ...vs, guildId: vs.guildId || guild.id }, now).catch((e) =>
          this.warn('discord_bot.watch_reconcile_open_failed', e, { userId: vs.userId }),
        );
      }

      // An EMPTY presence list is "we did not tell you", not "he is offline".
      if (guild.presences.size > 0) {
        const seen = new Set<string>();
        for (const pr of guild.presences.values()) {
          if (!this.tracks(pr.user.id)) continue;
          seen.add(pr.user.id);
          if (pr.status.trim() === '') continue;
          await this.applyPresence(presenceFromCache(pr, guild.id), now);
        }
        for (const id of this.watched) {
          if (seen.has(id)) continue;
          let open: StatusSession | null;
          try {
            open = await this.repo.openStatusSession(id);
          } catch {
            continue;
          }
          if (!open) continue;
          const endedAt = !open.heartbeatAt || open.heartbeatAt < open.startedAt ? open.startedAt : open.heartbeatAt;
          try {
            await this.repo.closeStatusSession(open, endedAt, 'stale');
          } catch (err) {
            this.warn('discord_bot.watch_reconcile_status_retire_failed', err, { userId: id });
            continue;
          }
          await this.recomputeSpan(id, open.startedAt, endedAt).catch((e) =>
            this.warn('discord_bot.watch_reconcile_status_recompute_failed', e, { userId: id }),
          );
        }
      }

      for (const id of this.watched) {
        if (present.has(id)) continue;
        let open: VoiceSession | null;
        try {
          open = await this.repo.openVoiceSession(id);
        } catch {
          continue;
        }
        if (!open || open.guildId !== guild.id) continue;
        const endedAt = !open.heartbeatAt || open.heartbeatAt < open.joinedAt ? open.joinedAt : open.heartbeatAt;
        bankFlags(open, endedAt);
        bankPeers(open, endedAt, open.peerCount);
        try {
          await this.repo.closeVoiceSession(open, endedAt, 'stale');
        } catch (err) {
          this.warn('discord_bot.watch_reconcile_retire_failed', err, { userId: id });
          continue;
        }
        await this.recomputeSpan(id, open.joinedAt, endedAt).catch((e) =>
          this.warn('discord_bot.watch_reconcile_recompute_failed', e, { userId: id }),
        );
      }
    });
  }

  // ── Messages and reactions ───────────────────────────────────────────────

  /** A tracked user's message: shape always, truncated text only with storeContent. */
  async handleMessage(m: Message): Promise<void> {
    const author = m.author;
    if (!author || !this.tracks(author.id)) return;
    const parsed = m.timestamp ? Date.parse(m.timestamp) : NaN;
    const sentAt = Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
    const content = m.content ?? '';
    const metrics = analyzeMessage(content);
    const row = {
      discordId: author.id,
      guildId: m.guild_id ?? '',
      channelId: m.channel_id,
      channelName: this.state.channelName(m.channel_id),
      messageId: m.id,
      sentAt,
      content: this.cfg.storeContent && content ? truncateRunes(content, CONTENT_LIMIT) : '',
      charCount: metrics.chars,
      wordCount: metrics.words,
      attachments: m.attachments?.length ?? 0,
      embeds: m.embeds?.length ?? 0,
      links: metrics.links,
      mentions: m.mentions?.length ?? 0,
      emoji: metrics.emoji,
      stickers: m.sticker_items?.length ?? 0,
      isReply: m.message_reference !== undefined && m.message_reference !== null,
      isQuestion: metrics.question,
      isLateNight: isLateNight(sentAt, this.tz),
      mentionsJob: matchesJobHunt(content),
    };
    await this.mu.run(async () => {
      try {
        await this.repo.insertMessage(row);
      } catch (err) {
        return this.warn('discord_bot.watch_insert_message_failed', err, { userId: author.id });
      }
      await this.repo
        .settleTypingSession(author.id, m.channel_id, sentAt, true)
        .catch((e) => this.warn('discord_bot.watch_settle_typing_failed', e, { userId: author.id }));
      await this.repo
        .upsertLiveIdentity(author.id, author.username ?? '', author.global_name ?? '', author.avatar ?? '')
        .catch((e) => this.warn('discord_bot.watch_live_identity_failed', e));
      await this.recomputeDay(author.id, this.dateKey(sentAt)).catch((e) => this.warn('discord_bot.watch_recompute_failed', e));
    });
  }

  /** Reactions both ways: given by him, or left on his recorded messages. */
  async handleReaction(e: { user_id?: string; message_id?: string }): Promise<void> {
    const userId = e.user_id ?? '';
    await this.mu.run(async () => {
      const now = Date.now();
      if (this.tracks(userId)) {
        await this.repo
          .bumpReactions(userId, this.dateKey(now), this.cfg.timeZone, 1, 0)
          .catch((err) => this.warn('discord_bot.watch_reaction_given_failed', err));
        return;
      }
      let found: { author: string; sentAt: number } | null;
      try {
        found = await this.repo.messageAuthor(e.message_id ?? '');
      } catch {
        return;
      }
      if (!found || !found.author) return;
      await this.repo
        .bumpReactions(found.author, this.dateKey(found.sentAt), this.cfg.timeZone, 0, 1)
        .catch((err) => this.warn('discord_bot.watch_reaction_received_failed', err));
    });
  }

  // ── Typing ───────────────────────────────────────────────────────────────

  async handleTyping(e: { user_id?: string; guild_id?: string; channel_id?: string; timestamp?: number }): Promise<void> {
    const userId = e.user_id ?? '';
    if (!this.tracks(userId)) return;
    const when = e.timestamp && e.timestamp > 0 ? e.timestamp * 1000 : Date.now();
    await this.mu.run(async () => {
      try {
        await this.repo.touchTypingSession(
          {
            id: '',
            discordId: userId,
            guildId: e.guild_id ?? '',
            channelId: e.channel_id ?? '',
            channelName: this.state.channelName(e.channel_id ?? ''),
            startedAt: when,
            lastTypingAt: when,
            settledAt: null,
            durationSec: 0,
            sent: false,
          },
          TYPING_IDLE_WINDOW_MS,
        );
      } catch (err) {
        return this.warn('discord_bot.watch_typing_failed', err, { userId });
      }
      await this.recomputeDay(userId, this.dateKey(when)).catch((err) => this.warn('discord_bot.watch_recompute_failed', err));
    });
  }

  /** Settle runs idle past the window, at their OWN last typing event (never now). Lock held. */
  private async sweepTyping(now: number): Promise<void> {
    let open;
    try {
      open = await this.repo.openTypingSessions();
    } catch (err) {
      return this.warn('discord_bot.watch_sweep_typing_failed', err);
    }
    const cutoff = now - TYPING_IDLE_WINDOW_MS;
    for (const run of open) {
      if (run.lastTypingAt > cutoff) continue;
      try {
        await this.repo.settleTypingSession(run.discordId, run.channelId, run.lastTypingAt, false);
      } catch (err) {
        this.warn('discord_bot.watch_settle_typing_failed', err, { userId: run.discordId });
        continue;
      }
      await this.recomputeDay(run.discordId, this.dateKey(run.startedAt)).catch((e) =>
        this.warn('discord_bot.watch_recompute_failed', e),
      );
    }
  }

  // ── Presence ─────────────────────────────────────────────────────────────

  async handlePresence(e: PresenceInput): Promise<void> {
    if (!e.user || !this.tracks(e.user.id)) return;
    await this.mu.run(() => this.applyPresence(e, Date.now()));
  }

  /** The whole presence path (live card, status log, activity sessions). Lock held. */
  private async applyPresence(e: PresenceInput, now: number): Promise<void> {
    const user = e.user!;
    const live = new Map<string, Activity>();
    for (const a of e.activities) {
      if (!a || a.type === 4 || a.name.trim() === '') continue;
      live.set(activityKey(a.name, a.type), a);
    }
    await this.recordLiveStatus(e);

    let status = e.status.trim();
    if (status !== '') {
      if (status === 'invisible') status = 'offline';
      await this.applyStatusSession(user.id, status, clientsFrom(e.clientStatus), now).catch((err) =>
        this.warn('discord_bot.watch_status_session_failed', err, { userId: user.id }),
      );
    }

    let open;
    try {
      open = await this.repo.openPresenceSessions(user.id);
    } catch (err) {
      return this.warn('discord_bot.watch_presence_lookup_failed', err);
    }
    const stillOpen = new Set<string>();
    for (const sess of open) {
      const key = activityKey(sess.activityName, sess.activityType);
      if (live.has(key)) {
        stillOpen.add(key);
        continue;
      }
      await this.repo.closePresenceSession(sess, now).catch((err) => this.warn('discord_bot.watch_close_presence_failed', err));
    }
    const midnight = localMidnight(now, this.tz);
    for (const [key, a] of live) {
      if (stillOpen.has(key)) continue;
      let startedAt = now;
      const ts = a.timestamps?.start ?? 0;
      if (ts > 0 && ts < now && ts > midnight) startedAt = ts;
      await this.repo
        .insertPresenceSession({
          id: '',
          discordId: user.id,
          guildId: e.guildId,
          activityName: truncateRunes(a.name, 120),
          activityType: a.type,
          details: truncateRunes(a.details ?? '', 200),
          state: truncateRunes(a.state ?? '', 200),
          startedAt,
          endedAt: null,
          durationSec: 0,
          heartbeatAt: now,
        })
        .catch((err) => this.warn('discord_bot.watch_open_presence_failed', err));
    }
    await this.recomputeDay(user.id, this.dateKey(now)).catch((err) => this.warn('discord_bot.watch_recompute_failed', err));
  }

  /** The online/idle/dnd log: one row per contiguous (status, client set) run. Lock held. */
  private async applyStatusSession(discordId: string, status: string, clients: ClientSet, now: number): Promise<void> {
    const open = await this.repo.openStatusSession(discordId);
    if (status === 'offline' || !anyClient(clients)) {
      if (!open) return;
      await this.repo.closeStatusSession(open, now, 'offline');
      return this.recomputeSpan(discordId, open.startedAt, now);
    }
    if (open && open.status === status && sameClients(open.clients, clients)) return;
    if (open) {
      await this.repo.closeStatusSession(open, now, 'change');
      await this.recomputeSpan(discordId, open.startedAt, now);
    }
    await this.repo.insertStatusSession({
      id: '',
      discordId,
      status,
      clients,
      startedAt: now,
      endedAt: null,
      durationSec: 0,
      heartbeatAt: now,
    });
    await this.recomputeDay(discordId, this.dateKey(now));
  }

  /** The profile card's "now" row; an empty status is left alone (no flicker). */
  private async recordLiveStatus(e: PresenceInput): Promise<void> {
    let status = e.status.trim();
    if (status === '' || !e.user) return;
    if (status === 'invisible') status = 'offline';
    let name = '';
    let kind: number | null = null;
    const live: LiveActivity[] = [];
    let custom = '';
    let customEmoji = '';
    for (const a of e.activities) {
      if (!a) continue;
      if (a.type === 4) {
        custom = truncateRunes((a.state ?? '').trim(), 190);
        if (a.emoji?.name) customEmoji = truncateRunes(a.emoji.name, 64);
        continue;
      }
      if (a.name.trim() === '') continue;
      const entry: LiveActivity = { name: truncateRunes(a.name, 120), type: a.type };
      const details = truncateRunes(a.details ?? '', 200);
      const state = truncateRunes(a.state ?? '', 200);
      if (details) entry.details = details;
      if (state) entry.state = state;
      const ts = a.timestamps?.start ?? 0;
      if (ts > 0) entry.startedAt = new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z');
      live.push(entry);
      if (kind === null || (!PLAYING_ACTIVITY_TYPES.has(kind) && PLAYING_ACTIVITY_TYPES.has(a.type))) {
        name = entry.name;
        kind = a.type;
      }
    }
    await this.repo
      .upsertLiveStatus(e.user.id, status, name, kind, live, custom, customEmoji)
      .catch((err) => this.warn('discord_bot.watch_live_status_failed', err));
    if (e.user.username) {
      await this.repo
        .upsertLiveIdentity(e.user.id, e.user.username, e.user.global_name ?? '', e.user.avatar ?? '')
        .catch((err) => this.warn('discord_bot.watch_live_identity_failed', err));
    }
  }

  /** Hourly REST poll for name + avatar (an avatar hash dies when the picture changes). */
  async refreshIdentities(): Promise<void> {
    for (const id of this.cfg.userIds) {
      let user;
      try {
        user = await this.port.getUser(id);
      } catch (err) {
        this.warn('discord_bot.watch_identity_refresh_failed', err, { userId: id });
        continue;
      }
      await this.mu
        .run(() => this.repo.upsertLiveIdentity(user.id, user.username ?? '', user.global_name ?? '', user.avatar ?? ''))
        .catch((err) => this.warn('discord_bot.watch_identity_write_failed', err, { userId: id }));
    }
  }

  // ── Rollups ──────────────────────────────────────────────────────────────

  /** Recompute every local day an interval touches. Lock held. */
  async recomputeSpan(discordId: string, from: number, to: number): Promise<void> {
    if (to < from) [from, to] = [to, from];
    let cursor = from;
    while (!(cursor > to)) {
      await this.recomputeDay(discordId, this.dateKey(cursor));
      const [, next] = dayBounds(this.dateKey(cursor), this.tz);
      if (!(next > cursor)) return;
      cursor = next;
    }
  }

  /** Rebuild one day from the raw rows and write it. Lock held. */
  async recomputeDay(discordId: string, dateKey: string): Promise<void> {
    const [from, to] = dayBounds(dateKey, this.tz);
    const now = Date.now();
    const messages = await this.repo.messagesForDay(discordId, from, to);
    const voice = await this.repo.voiceSessionsOverlapping(discordId, from, to);
    const presence = await this.repo.presenceSessionsOverlapping(discordId, from, to);
    const statuses = await this.repo.statusSessionsOverlapping(discordId, from, to);
    const typing = await this.repo.typingSessionsStartedIn(discordId, from, to);
    const roll = buildDayRollup(discordId, dateKey, this.tz, from, to, now, messages, voice, presence, statuses, typing);
    // The rollup's hour math runs in the resolved zone even when the configured name was bad.
    roll.timeZone = this.cfg.timeZone;
    await this.repo.writeDayRollup(roll);
  }
}
