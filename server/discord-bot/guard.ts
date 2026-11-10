/**
 * The bot's blast-radius limits: which gateway events reach a handler and which REST calls may
 * leave the process.
 *
 * Production sets none of this and the bot behaves exactly as the Go one did (every guild it is
 * in). A live test against the shared production bot sets:
 *
 *   DISCORD_BOT_GUILD_ALLOWLIST    guild ids. An event from any other guild — or from no guild at
 *                                  all (DMs) — is dropped before state, handlers or logs. REST
 *                                  calls aimed at other guilds' channels are refused. Global
 *                                  application-command writes are refused outright, and the bot's
 *                                  presence is never changed (it is shared with every guild).
 *   DISCORD_BOT_CHANNEL_ALLOWLIST  (test mode) channel ids. Only events in these channels pass,
 *                                  and only the bot's OWN messages: no real user's message,
 *                                  typing, reaction or interaction ever reaches a handler. Presence
 *                                  and voice events are dropped and the guild sync is stripped of
 *                                  members, presences and voice states. Outbound: only these
 *                                  channels; every message is prefixed "[test]"; at most
 *                                  DISCORD_BOT_TEST_MAX_MESSAGES (default 5) are created and all of
 *                                  them are deleted on shutdown; guild command writes are refused.
 *
 * In test mode one of the bot's own messages that starts with "[test] trigger" is handed to the
 * message handlers as if a person had sent it, so the mention path can be exercised end to end
 * without involving anyone else. Nothing else from the bot itself is ever handled (loop guard).
 *
 * Pure: no Discord or database imports, so the rules are unit-tested as a table.
 */
import { getCSV, getInt } from './config';

export interface GuardConfig {
  guilds: ReadonlySet<string> | null;
  channels: ReadonlySet<string> | null;
  maxTestMessages: number;
}

export function loadGuardConfig(env: Record<string, string | undefined> = process.env): GuardConfig {
  const guilds = getCSV('DISCORD_BOT_GUILD_ALLOWLIST', env);
  const channels = getCSV('DISCORD_BOT_CHANNEL_ALLOWLIST', env);
  return {
    guilds: guilds.length ? new Set(guilds) : null,
    channels: channels.length ? new Set(channels) : null,
    maxTestMessages: Math.max(0, getInt('DISCORD_BOT_TEST_MAX_MESSAGES', 5, env)),
  };
}

/** Any allowlist set: the bot is sharing a token with production and must stay in its lane. */
export function restricted(cfg: GuardConfig): boolean {
  return cfg.guilds !== null || cfg.channels !== null;
}

/** Channel test mode (the strictest): only the bot's own traffic in named channels. */
export function testMode(cfg: GuardConfig): boolean {
  return cfg.channels !== null;
}

export const TEST_PREFIX = '[test]';
export const TEST_TRIGGER = '[test] trigger';

/** Events that carry what a user said or did in a channel. */
const CHANNEL_CONTENT_EVENTS = new Set([
  'MESSAGE_CREATE',
  'MESSAGE_UPDATE',
  'MESSAGE_DELETE',
  'MESSAGE_DELETE_BULK',
  'MESSAGE_REACTION_ADD',
  'MESSAGE_REACTION_REMOVE',
  'MESSAGE_REACTION_REMOVE_ALL',
  'MESSAGE_REACTION_REMOVE_EMOJI',
  'TYPING_START',
]);

/** Guild-less events that are safe to let through (connection bookkeeping). */
const GUILDLESS_OK = new Set(['READY', 'RESUMED']);

type Json = Record<string, unknown>;

function guildIdOf(t: string, d: Json): string | undefined {
  if (t.startsWith('GUILD_') && !t.startsWith('GUILD_MEMBER') && !t.startsWith('GUILD_ROLE')) {
    // GUILD_CREATE / GUILD_UPDATE / GUILD_DELETE carry the guild as the payload.
    if (t === 'GUILD_CREATE' || t === 'GUILD_UPDATE' || t === 'GUILD_DELETE') {
      return typeof d.id === 'string' ? d.id : undefined;
    }
  }
  return typeof d.guild_id === 'string' ? d.guild_id : undefined;
}

function authorIdOf(t: string, d: Json): string | undefined {
  if (t === 'MESSAGE_CREATE' || t === 'MESSAGE_UPDATE') {
    const a = d.author as Json | undefined;
    return typeof a?.id === 'string' ? a.id : undefined;
  }
  return typeof d.user_id === 'string' ? d.user_id : undefined;
}

/**
 * Filter one gateway dispatch. Returns the (possibly sanitised) payload to dispatch, or null to
 * drop it before anything else sees it.
 */
export function filterDispatch(cfg: GuardConfig, t: string, d: unknown, selfId: string): unknown {
  if (!restricted(cfg)) return d;
  if (d === null || typeof d !== 'object') return GUILDLESS_OK.has(t) ? d : null;
  const data = d as Json;

  if (t === 'READY') {
    const guilds = Array.isArray(data.guilds) ? (data.guilds as Json[]) : [];
    return {
      ...data,
      guilds: cfg.guilds ? guilds.filter((g) => cfg.guilds!.has(String(g.id))) : guilds,
    };
  }
  if (GUILDLESS_OK.has(t)) return d;

  const guildId = guildIdOf(t, data);
  if (!guildId) return null; // DMs and anything not tied to a guild
  if (cfg.guilds && !cfg.guilds.has(guildId)) return null;

  if (!testMode(cfg)) return d;
  const channels = cfg.channels!;

  if (t === 'GUILD_CREATE') {
    // Metadata only: the channel list, roles and our own member record (for permissions).
    const members = Array.isArray(data.members) ? (data.members as Json[]) : [];
    return {
      ...data,
      members: members.filter((m) => (m.user as Json | undefined)?.id === selfId),
      presences: [],
      voice_states: [],
    };
  }
  if (t === 'INTERACTION_CREATE') return null; // only people create interactions
  if (t === 'PRESENCE_UPDATE' || t === 'VOICE_STATE_UPDATE') return null;
  if (t.startsWith('GUILD_MEMBER')) {
    const user = data.user as Json | undefined;
    return user?.id === selfId ? d : null;
  }
  if (CHANNEL_CONTENT_EVENTS.has(t)) {
    if (typeof data.channel_id !== 'string' || !channels.has(data.channel_id)) return null;
    if (authorIdOf(t, data) !== selfId) return null;
    if (t === 'MESSAGE_CREATE') {
      const content = typeof data.content === 'string' ? data.content : '';
      if (!content.startsWith(TEST_TRIGGER)) return null; // never handle our own replies
      // Present it to the handlers as a person's message (bot:false) so the mention path runs.
      return { ...data, author: { ...(data.author as Json), bot: false } };
    }
    return null;
  }
  // CHANNEL_*, THREAD_*, GUILD_ROLE_*, GUILD_UPDATE: metadata, kept for the state cache.
  return d;
}

/** What a REST call targets, for the outbound check. */
export interface RouteTarget {
  method: string;
  route: string;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * May this REST call leave the process? `channelGuild` resolves a channel to its guild from the
 * gateway state (undefined when unknown, which is refused while restricted).
 */
export function checkRoute(
  cfg: GuardConfig,
  { method, route }: RouteTarget,
  ctx: { selfId: string; channelGuild: (channelId: string) => string | undefined },
): Verdict {
  if (!restricted(cfg)) return { ok: true };
  const m = method.toUpperCase();
  const parts = route.split('?')[0]!.split('/').filter(Boolean);

  if (parts[0] === 'gateway') return { ok: true };
  // Interaction callbacks and follow-ups only exist for interactions that passed the filter.
  if (parts[0] === 'interactions') return { ok: true };
  if (parts[0] === 'webhooks' && parts.length >= 3) return { ok: true };

  if (parts[0] === 'channels' && parts[1]) {
    const channelId = parts[1];
    if (cfg.channels) {
      return cfg.channels.has(channelId)
        ? { ok: true }
        : { ok: false, reason: `channel ${channelId} is not in DISCORD_BOT_CHANNEL_ALLOWLIST` };
    }
    const guild = ctx.channelGuild(channelId);
    if (!guild || !cfg.guilds!.has(guild)) {
      return { ok: false, reason: `channel ${channelId} is not in an allowlisted guild` };
    }
    return { ok: true };
  }

  if (parts[0] === 'guilds' && parts[1]) {
    if (cfg.guilds && !cfg.guilds.has(parts[1])) {
      return { ok: false, reason: `guild ${parts[1]} is not in DISCORD_BOT_GUILD_ALLOWLIST` };
    }
    return { ok: true };
  }

  if (parts[0] === 'applications') {
    // /applications/{app}/commands (global) or /applications/{app}/guilds/{g}/commands.
    if (parts[2] === 'commands') {
      return WRITE.has(m)
        ? { ok: false, reason: 'global application-command writes are refused while restricted' }
        : { ok: true };
    }
    if (parts[2] === 'guilds' && parts[3]) {
      if (cfg.guilds && !cfg.guilds.has(parts[3])) {
        return { ok: false, reason: `guild ${parts[3]} is not in DISCORD_BOT_GUILD_ALLOWLIST` };
      }
      if (testMode(cfg) && WRITE.has(m)) {
        return { ok: false, reason: 'guild command writes are refused in channel test mode' };
      }
      return { ok: true };
    }
  }

  if (parts[0] === 'users' && parts[1]) {
    // Reads only: no DM channel is ever opened and the bot's own profile is never edited.
    if (m !== 'GET') return { ok: false, reason: 'user-route writes (DMs, profile edits) are refused while restricted' };
    if (!testMode(cfg)) return { ok: true };
    return parts[1] === '@me' || parts[1] === ctx.selfId
      ? { ok: true }
      : { ok: false, reason: 'user lookups are refused in channel test mode' };
  }

  return { ok: false, reason: `route ${m} /${parts.join('/')} is not allowed while restricted` };
}

/** Prefix a message body's content in test mode so every post is visibly a test. */
export function prefixTestContent<T extends { content?: string | null }>(body: T): T {
  const content = body.content ?? '';
  if (content.startsWith(TEST_PREFIX)) return body;
  return { ...body, content: content ? `${TEST_PREFIX} ${content}` : TEST_PREFIX };
}
