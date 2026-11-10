/**
 * The gateway state cache — the slice of discordgo's `State` the Go bot read.
 *
 * @discordjs/ws hands us raw dispatches and keeps nothing, so this rebuilds what the handlers
 * need from them: per guild its owner, system channel, channels (+ threads), roles, the members
 * the gateway told us about (for the bot flag and our own permissions), voice states and
 * presences. Like discordgo, every `GUILD_CREATE` replaces a guild wholesale, so a reconnect
 * re-seeds it.
 *
 * One behaviour is copied on purpose: a presence update MERGES into the cached one (status only
 * when non-empty, each client status only when non-empty, activities replaced). That is what
 * discordgo does, and the presence sweep (watch/presencesync.ts) is written knowing the cached
 * client set is not authoritative for sign-outs.
 *
 * Pure data structure: no network, unit-tested directly.
 */

export interface CachedChannel {
  id: string;
  guildId: string;
  type: number;
  name: string;
  position: number;
  parentId: string | null;
  overwrites: Array<{ id: string; type: number; allow: bigint; deny: bigint }>;
}

export interface CachedRole {
  id: string;
  permissions: bigint;
}

export interface CachedMember {
  userId: string;
  bot: boolean;
  roles: string[];
}

export interface VoiceState {
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

export interface PresenceUser {
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface Activity {
  name: string;
  type: number;
  details?: string | null;
  state?: string | null;
  timestamps?: { start?: number; end?: number } | null;
  emoji?: { name?: string } | null;
}

export interface ClientStatus {
  desktop?: string;
  mobile?: string;
  web?: string;
}

export interface Presence {
  user: PresenceUser;
  status: string;
  activities: Activity[];
  clientStatus: ClientStatus;
}

export interface CachedGuild {
  id: string;
  ownerId: string;
  systemChannelId: string | null;
  channels: Map<string, CachedChannel>;
  roles: Map<string, CachedRole>;
  members: Map<string, CachedMember>;
  voiceStates: Map<string, VoiceState>;
  presences: Map<string, Presence>;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const big = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? '0'));
  } catch {
    return 0n;
  }
};

export const PERM = {
  ADMINISTRATOR: 1n << 3n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
} as const;

const ALL_PERMISSIONS = (1n << 64n) - 1n;

/** Discord channel type 0 = GUILD_TEXT. */
export const CHANNEL_GUILD_TEXT = 0;

function toChannel(guildId: string, c: Json): CachedChannel {
  return {
    id: String(c.id),
    guildId,
    type: Number(c.type ?? 0),
    name: String(c.name ?? ''),
    position: Number(c.position ?? 0),
    parentId: c.parent_id ? String(c.parent_id) : null,
    overwrites: Array.isArray(c.permission_overwrites)
      ? c.permission_overwrites.map((o: Json) => ({
          id: String(o.id),
          type: Number(o.type),
          allow: big(o.allow),
          deny: big(o.deny),
        }))
      : [],
  };
}

function toMember(m: Json): CachedMember | null {
  const user = m.user as Json | undefined;
  if (!user?.id) return null;
  return {
    userId: String(user.id),
    bot: Boolean(user.bot),
    roles: Array.isArray(m.roles) ? m.roles.map(String) : [],
  };
}

export function toVoiceState(v: Json, guildId: string): VoiceState {
  return {
    userId: String(v.user_id),
    guildId: String(v.guild_id ?? guildId),
    channelId: v.channel_id ? String(v.channel_id) : '',
    selfMute: Boolean(v.self_mute),
    selfDeaf: Boolean(v.self_deaf),
    selfStream: Boolean(v.self_stream),
    selfVideo: Boolean(v.self_video),
    mute: Boolean(v.mute),
    deaf: Boolean(v.deaf),
  };
}

export function toActivities(raw: unknown): Activity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Json => a !== null && typeof a === 'object')
    .map((a) => ({
      name: String(a.name ?? ''),
      type: Number(a.type ?? 0),
      details: a.details ?? null,
      state: a.state ?? null,
      timestamps: a.timestamps ?? null,
      emoji: a.emoji ?? null,
    }));
}

export function toPresence(p: Json): Presence | null {
  const user = p.user as Json | undefined;
  if (!user?.id) return null;
  const cs = (p.client_status ?? {}) as Json;
  return {
    user: {
      id: String(user.id),
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
    },
    status: String(p.status ?? ''),
    activities: toActivities(p.activities),
    clientStatus: { desktop: cs.desktop, mobile: cs.mobile, web: cs.web },
  };
}

export class GatewayState {
  selfId = '';
  applicationId = '';
  readonly guilds = new Map<string, CachedGuild>();
  private readonly channelIndex = new Map<string, string>(); // channelId -> guildId

  /** Apply one (already filtered) dispatch. Unknown events are ignored. */
  apply(t: string, d: Json): void {
    switch (t) {
      case 'READY':
        this.selfId = String(d.user?.id ?? '');
        this.applicationId = String(d.application?.id ?? this.selfId);
        break;
      case 'GUILD_CREATE':
        if (!d.unavailable) this.putGuild(d);
        break;
      case 'GUILD_UPDATE': {
        const g = this.guilds.get(String(d.id));
        if (g) {
          g.ownerId = String(d.owner_id ?? g.ownerId);
          g.systemChannelId = d.system_channel_id ? String(d.system_channel_id) : null;
          if (Array.isArray(d.roles)) {
            g.roles = new Map(d.roles.map((r: Json) => [String(r.id), { id: String(r.id), permissions: big(r.permissions) }]));
          }
        }
        break;
      }
      case 'GUILD_DELETE':
        if (!d.unavailable) this.dropGuild(String(d.id));
        break;
      case 'CHANNEL_CREATE':
      case 'CHANNEL_UPDATE':
      case 'THREAD_CREATE':
      case 'THREAD_UPDATE': {
        const g = d.guild_id ? this.guilds.get(String(d.guild_id)) : undefined;
        if (g) {
          const ch = toChannel(g.id, d);
          g.channels.set(ch.id, ch);
          this.channelIndex.set(ch.id, g.id);
        }
        break;
      }
      case 'CHANNEL_DELETE':
      case 'THREAD_DELETE': {
        const g = d.guild_id ? this.guilds.get(String(d.guild_id)) : undefined;
        g?.channels.delete(String(d.id));
        this.channelIndex.delete(String(d.id));
        break;
      }
      case 'GUILD_ROLE_CREATE':
      case 'GUILD_ROLE_UPDATE': {
        const g = this.guilds.get(String(d.guild_id));
        if (g && d.role) g.roles.set(String(d.role.id), { id: String(d.role.id), permissions: big(d.role.permissions) });
        break;
      }
      case 'GUILD_ROLE_DELETE':
        this.guilds.get(String(d.guild_id))?.roles.delete(String(d.role_id));
        break;
      case 'GUILD_MEMBER_ADD':
      case 'GUILD_MEMBER_UPDATE': {
        const g = this.guilds.get(String(d.guild_id));
        const m = toMember(d);
        if (g && m) g.members.set(m.userId, m);
        break;
      }
      case 'GUILD_MEMBER_REMOVE':
        this.guilds.get(String(d.guild_id))?.members.delete(String(d.user?.id));
        break;
      case 'VOICE_STATE_UPDATE': {
        const g = d.guild_id ? this.guilds.get(String(d.guild_id)) : undefined;
        if (!g) break;
        const vs = toVoiceState(d, g.id);
        if (vs.channelId) g.voiceStates.set(vs.userId, vs);
        else g.voiceStates.delete(vs.userId);
        if (d.member) {
          const m = toMember(d.member);
          if (m) g.members.set(m.userId, m);
        }
        break;
      }
      case 'PRESENCE_UPDATE': {
        const g = d.guild_id ? this.guilds.get(String(d.guild_id)) : undefined;
        if (g) this.mergePresence(g, d);
        break;
      }
      case 'MESSAGE_CREATE': {
        // discordgo tracks the member carried on a guild message, which is how it learns
        // members (and their bot flag) without the privileged members intent.
        const g = d.guild_id ? this.guilds.get(String(d.guild_id)) : undefined;
        if (g && d.member && d.author?.id) {
          g.members.set(String(d.author.id), {
            userId: String(d.author.id),
            bot: Boolean(d.author.bot),
            roles: Array.isArray(d.member.roles) ? d.member.roles.map(String) : [],
          });
        }
        break;
      }
    }
  }

  private putGuild(d: Json): void {
    const id = String(d.id);
    this.dropGuild(id);
    const g: CachedGuild = {
      id,
      ownerId: String(d.owner_id ?? ''),
      systemChannelId: d.system_channel_id ? String(d.system_channel_id) : null,
      channels: new Map(),
      roles: new Map(),
      members: new Map(),
      voiceStates: new Map(),
      presences: new Map(),
    };
    for (const c of [...(d.channels ?? []), ...(d.threads ?? [])] as Json[]) {
      const ch = toChannel(id, c);
      g.channels.set(ch.id, ch);
      this.channelIndex.set(ch.id, id);
    }
    for (const r of (d.roles ?? []) as Json[]) g.roles.set(String(r.id), { id: String(r.id), permissions: big(r.permissions) });
    for (const m of (d.members ?? []) as Json[]) {
      const mem = toMember(m);
      if (mem) g.members.set(mem.userId, mem);
    }
    for (const v of (d.voice_states ?? []) as Json[]) {
      const vs = toVoiceState(v, id);
      if (vs.channelId) g.voiceStates.set(vs.userId, vs);
    }
    for (const p of (d.presences ?? []) as Json[]) {
      const pr = toPresence(p);
      if (pr) g.presences.set(pr.user.id, pr);
    }
    this.guilds.set(id, g);
  }

  private dropGuild(id: string): void {
    const g = this.guilds.get(id);
    if (!g) return;
    for (const ch of g.channels.keys()) this.channelIndex.delete(ch);
    this.guilds.delete(id);
  }

  private mergePresence(g: CachedGuild, d: Json): void {
    const incoming = toPresence(d);
    if (!incoming) return;
    const prev = g.presences.get(incoming.user.id);
    if (!prev) {
      g.presences.set(incoming.user.id, incoming);
      return;
    }
    if (incoming.status) prev.status = incoming.status;
    prev.activities = incoming.activities;
    if (incoming.clientStatus.desktop) prev.clientStatus.desktop = incoming.clientStatus.desktop;
    if (incoming.clientStatus.mobile) prev.clientStatus.mobile = incoming.clientStatus.mobile;
    if (incoming.clientStatus.web) prev.clientStatus.web = incoming.clientStatus.web;
    if (incoming.user.username) prev.user.username = incoming.user.username;
    if (incoming.user.global_name !== undefined) prev.user.global_name = incoming.user.global_name;
    if (incoming.user.avatar !== undefined) prev.user.avatar = incoming.user.avatar;
  }

  guild(id: string): CachedGuild | undefined {
    return this.guilds.get(id);
  }

  channel(id: string): CachedChannel | undefined {
    const gid = this.channelIndex.get(id);
    return gid ? this.guilds.get(gid)?.channels.get(id) : undefined;
  }

  channelGuild(id: string): string | undefined {
    return this.channelIndex.get(id);
  }

  channelName(id: string): string {
    return id ? (this.channel(id)?.name ?? '') : '';
  }

  member(guildId: string, userId: string): CachedMember | undefined {
    return this.guilds.get(guildId)?.members.get(userId);
  }

  /**
   * A user's permissions in a channel, or null when it cannot be computed (guild, channel or
   * member unknown) — callers then let the send itself decide, as the Go bot did.
   */
  channelPermissions(userId: string, channelId: string): bigint | null {
    const ch = this.channel(channelId);
    if (!ch) return null;
    const g = this.guilds.get(ch.guildId);
    const member = g?.members.get(userId);
    if (!g || !member) return null;
    if (g.ownerId === userId) return ALL_PERMISSIONS;

    let perms = g.roles.get(g.id)?.permissions ?? 0n; // @everyone
    for (const r of member.roles) perms |= g.roles.get(r)?.permissions ?? 0n;
    if (perms & PERM.ADMINISTRATOR) return ALL_PERMISSIONS;

    const everyone = ch.overwrites.find((o) => o.id === g.id);
    if (everyone) perms = (perms & ~everyone.deny) | everyone.allow;
    let allow = 0n;
    let deny = 0n;
    for (const o of ch.overwrites) {
      if (o.type === 0 && member.roles.includes(o.id)) {
        allow |= o.allow;
        deny |= o.deny;
      }
    }
    perms = (perms & ~deny) | allow;
    const own = ch.overwrites.find((o) => o.type === 1 && o.id === userId);
    if (own) perms = (perms & ~own.deny) | own.allow;
    return perms;
  }

  /** A user's current voice state across every guild, or null (Go lookupVoiceState). Copied. */
  lookupVoiceState(userId: string): VoiceState | null {
    for (const g of this.guilds.values()) {
      const vs = g.voiceStates.get(userId);
      if (vs && vs.channelId) return { ...vs, guildId: vs.guildId || g.id };
    }
    return null;
  }

  /** A user's cached presence and the guild it came from (Go lookupPresence). Copied. */
  lookupPresence(userId: string): { presence: Presence; guildId: string } | null {
    for (const g of this.guilds.values()) {
      const p = g.presences.get(userId);
      if (p) {
        return {
          presence: { ...p, user: { ...p.user }, activities: [...p.activities], clientStatus: { ...p.clientStatus } },
          guildId: g.id,
        };
      }
    }
    return null;
  }

  knowsGuild(id: string): boolean {
    return id !== '' && this.guilds.has(id);
  }

  /** The other humans in a voice channel (Go countVoicePeers): known bots are not company. */
  countVoicePeers(guildId: string, channelId: string, exclude: string): number {
    if (!channelId) return 0;
    const g = this.guilds.get(guildId);
    if (!g) return 0;
    let n = 0;
    for (const vs of g.voiceStates.values()) {
      if (vs.channelId !== channelId || vs.userId === exclude) continue;
      if (g.members.get(vs.userId)?.bot) continue;
      n++;
    }
    return n;
  }
}
