/**
 * The gateway bot's lifecycle and event routing (port of discordbot/run.go + bot.go).
 *
 * Opens one gateway session (@discordjs/ws), keeps the state cache (state.ts), bulk-registers the
 * slash commands on READY (guild-scoped when DISCORD_DEV_GUILD_ID is set, else global, preserving
 * Entry Point commands), routes interactions with owner-gating, and feeds the activity tracker.
 * Periodic work — Alex's care tick, the tracker flush, the identity poll, the summarizer — is NOT
 * timed here: those are pg-boss crons (jobs.ts) that call the tick methods below, which no-op
 * until the gateway is ready.
 *
 * Every gateway dispatch passes the guard (guard.ts) BEFORE the state cache, any handler or any
 * log line sees it. Each handled event runs as its own task (Go ran a goroutine per mention and
 * per interaction), tracked so shutdown can let in-flight replies finish.
 */
import { REST } from '@discordjs/rest';
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';
import { GatewayIntentBits } from '@discordjs/core';
import { createLogger } from '../shared/logger';
import { prisma } from '../../lib/prisma.server';
import { getBool, getDuration, getString } from './config';
import { ChatService } from './chat';
import { Sql, type RawClient } from './db';
import { DeepSeekClient } from './deepseek';
import { RestDiscordPort, type CommandDefinition, type DiscordPort, type Message } from './discord';
import { filterDispatch, loadGuardConfig, restricted, testMode, type GuardConfig } from './guard';
import {
  InteractionType,
  OptionMap,
  canToggleAlex,
  interactionUser,
  modalValue,
  respondEphemeral,
  showModal,
  slashCommands,
  splitCustomId,
  type Interaction,
} from './interactions';
import { configurePetRates } from './pet';
import { PetAI } from './pet-ai';
import { AlexImager } from './pet-image';
import { PetRepo } from './pet-repo';
import { PetService, type BotLogger } from './pet-service';
import { RETRY_GATEWAY, backoff, sleep } from './retry';
import { GatewayState, toActivities, toVoiceState } from './state';
import { WatchRepo } from './watch/repo';
import { WatchSummarizer } from './watch/summarizer';
import { WatchService, loadWatchConfig, type PresenceInput } from './watch/watch';

/** Bounds one interaction's work (a chat reply or an image). */
const INTERACTION_TIMEOUT_MS = 2 * 60_000;
const MENTION_TIMEOUT_MS = 50_000;
const INTRO_TIMEOUT_MS = 30_000;
/** Close codes that will fail identically on every reconnect (bad token, bad intents). */
const FATAL_CLOSE_CODES: Record<number, string> = {
  4004: 'authentication failed (bad DISCORD_BOT_TOKEN)',
  4013: 'invalid intents',
  4014: 'disallowed intents — enable the privileged intents in the Developer Portal, then restart',
};

export interface BotConfig {
  token: string;
  devGuildId: string;
  ownerId: string;
  deepseekKey: string;
  deepseekModel: string;
  messageContent: boolean;
  imageBaseURL: string;
  drainMs: number;
}

export function loadBotConfig(env: Record<string, string | undefined> = process.env): BotConfig {
  return {
    token: getString('DISCORD_BOT_TOKEN', '', env) || getString('DISCORD_ACTIVITY_BOT_TOKEN', '', env),
    devGuildId: getString('DISCORD_DEV_GUILD_ID', '', env),
    ownerId: getString('OWNER_ID', '', env),
    deepseekKey: getString('DEEPSEEK_API_KEY', '', env),
    deepseekModel: getString('DEEPSEEK_MODEL', 'deepseek-chat', env),
    messageContent: getBool('ALEX_MESSAGE_CONTENT', false, env),
    imageBaseURL: getString('ALEX_PUBLIC_BASE_URL', 'https://rmhstudios.com', env),
    // Inside the jobs container's stop_grace_period (90s), beside pg-boss's own 30s drain.
    drainMs: getDuration('DISCORD_BOT_DRAIN_GRACE', 60_000, env),
  };
}

/** The gateway intents (watch on: voice, presences, reactions, typing; content when stored). */
export function intentsFor(cfg: { messageContent: boolean }, watch: { storeContent: boolean } | null): number {
  let intents = GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages;
  if (cfg.messageContent) intents |= GatewayIntentBits.MessageContent;
  if (watch) {
    intents |=
      GatewayIntentBits.GuildVoiceStates |
      GatewayIntentBits.GuildPresences |
      GatewayIntentBits.GuildMessageReactions |
      GatewayIntentBits.GuildMessageTyping;
    if (watch.storeContent) intents |= GatewayIntentBits.MessageContent;
  }
  return intents;
}

/** The commands to bulk-overwrite: ours plus any existing Entry Point command (type 4). */
export function commandsToRegister(existing: CommandDefinition[] | null): CommandDefinition[] {
  const desired = slashCommands();
  for (const c of existing ?? []) if (Number(c.type) === 4) desired.push(c);
  return desired;
}

/** Is this guild message aimed at Alex (an @mention, or a reply to one of his messages)? */
export function mentionTarget(m: Message, botId: string): boolean {
  if (!botId) return false;
  const mentioned = (m.mentions ?? []).some((u) => u.id === botId);
  const replyToAlex = m.referenced_message?.author?.id === botId;
  return mentioned || replyToAlex;
}

export class DiscordBot {
  readonly log: BotLogger = createLogger('discord-bot');
  readonly state = new GatewayState();
  readonly guard: GuardConfig;
  private readonly rest: REST;
  private readonly manager: WebSocketManager;
  readonly port: RestDiscordPort;
  readonly pet: PetService;
  readonly chat: ChatService;
  readonly watch: WatchService | null;
  readonly summarizer: WatchSummarizer | null;
  private readonly inflight = new Set<Promise<unknown>>();
  private readonly lifecycle = new AbortController();
  private ready = false;
  private watchStarted = false;
  private stopping = false;
  private shardIds: number[] = [0];

  constructor(
    readonly cfg: BotConfig,
    raw: RawClient | null = prisma as unknown as RawClient,
  ) {
    this.guard = loadGuardConfig();
    configurePetRates();
    this.rest = new REST({ version: '10' }).setToken(cfg.token);
    const sql = new Sql(raw, this.log);
    const deepseek = new DeepSeekClient(cfg.deepseekKey, cfg.deepseekModel, this.log);
    const watchCfg = loadWatchConfig();
    const intents = intentsFor(cfg, watchCfg.userIds.length ? watchCfg : null);

    this.manager = new WebSocketManager({ token: cfg.token, intents, rest: this.rest });
    this.port = new RestDiscordPort({
      rest: this.rest,
      guard: this.guard,
      selfId: () => this.state.selfId,
      applicationId: () => this.state.applicationId,
      channelGuild: (id) => this.state.channelGuild(id),
      sendPresence: (d) => {
        for (const id of this.shardIds) void this.manager.send(id, { op: 3, d } as never);
      },
      logger: this.log,
    });

    const repo = new PetRepo(sql);
    this.pet = new PetService({
      repo,
      imager: new AlexImager(repo),
      ai: new PetAI(deepseek, this.log),
      port: this.port,
      state: this.state,
      logger: this.log,
      imageBaseURL: cfg.imageBaseURL,
    });
    this.chat = new ChatService({ deepseek, sql, port: this.port, logger: this.log, pet: this.pet });

    const watchRepo = new WatchRepo(sql);
    this.watch = WatchService.create(watchCfg, watchRepo, this.state, this.port, this.log);
    this.summarizer = this.watch
      ? WatchSummarizer.create(watchCfg, this.watch.tz, watchRepo, deepseek, this.port, this.log)
      : null;
    if (this.watch) {
      this.log.info({
        event: 'discord_bot.watch_enabled',
        users: watchCfg.userIds.length,
        timeZone: watchCfg.timeZone,
        storeContent: watchCfg.storeContent,
      });
      if (!this.summarizer) {
        this.log.warn({ event: 'discord_bot.watch_no_deepseek', detail: 'figures will be tracked without written summaries' });
      }
    }

    this.manager.on(WebSocketShardEvents.Dispatch, (payload) => this.onDispatch(payload.t, payload.d));
    this.manager.on(WebSocketShardEvents.Closed, (code) => {
      this.ready = false;
      const fatal = FATAL_CLOSE_CODES[code];
      if (fatal) this.log.error({ event: 'discord_bot.gateway_closed_fatal', code, detail: fatal });
      else if (this.stopping) this.log.info({ event: 'discord_bot.gateway_closed', code });
      else this.log.warn({ event: 'discord_bot.gateway_closed', code });
    });
    this.manager.on(WebSocketShardEvents.Resumed, () => {
      this.ready = true;
      this.log.info({ event: 'discord_bot.gateway_resumed' });
    });
    this.manager.on(WebSocketShardEvents.Error, (err) =>
      this.log.warn({ event: 'discord_bot.gateway_error', err: err.message }),
    );

    if (restricted(this.guard)) {
      this.log.warn({
        event: 'discord_bot.restricted',
        guilds: this.guard.guilds ? [...this.guard.guilds] : null,
        channels: this.guard.channels ? [...this.guard.channels] : null,
        testMode: testMode(this.guard),
      });
    }
  }

  /** True once READY has been processed and the session is live. */
  isReady(): boolean {
    return this.ready && !this.stopping;
  }

  /**
   * Open the gateway. Patient, like the Go bot (8 tries, 2s → 60s), and then still patient: this
   * process hosts every other job, so a Discord outage must never exit it. Each failed round is an
   * ERROR line, so a bad token is loud rather than silent.
   */
  async start(): Promise<void> {
    for (let round = 1; !this.stopping; round++) {
      for (let attempt = 1; attempt <= RETRY_GATEWAY.attempts && !this.stopping; attempt++) {
        try {
          await this.manager.connect();
          this.shardIds = [...(await this.manager.getShardIds())];
          this.log.info({ event: 'discord_bot.gateway_opened', shards: this.shardIds.length });
          return;
        } catch (err) {
          const delay = backoff(RETRY_GATEWAY, attempt);
          this.log.warn({
            event: 'discord_bot.gateway_open_retry',
            attempt,
            of: RETRY_GATEWAY.attempts,
            inMs: delay,
            err: (err as Error).message,
          });
          if (!(await sleep(delay, this.lifecycle.signal))) return;
        }
      }
      if (!this.stopping) this.log.error({ event: 'discord_bot.gateway_open_failed', round });
    }
  }

  /** Run a handler as a tracked task; errors are logged, never thrown into the gateway loop. */
  private task(label: string, fn: () => Promise<unknown>): void {
    const p = fn()
      .catch((err) => this.log.error({ event: 'discord_bot.handler_error', handler: label, err: (err as Error)?.message }))
      .finally(() => this.inflight.delete(p));
    this.inflight.add(p);
  }

  private timeoutSignal(ms: number): AbortSignal {
    return AbortSignal.any([this.lifecycle.signal, AbortSignal.timeout(ms)]);
  }

  /** Route one dispatch: guard → state → handlers. */
  onDispatch(t: string, raw: unknown): void {
    if (this.stopping) return;
    const d = filterDispatch(this.guard, t, raw, this.state.selfId);
    if (d === null || d === undefined) return;
    const data = d as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    this.state.apply(t, data);

    switch (t) {
      case 'READY':
        this.ready = true;
        this.log.info({
          event: 'discord_bot.ready',
          user: data.user?.username,
          guilds: Array.isArray(data.guilds) ? data.guilds.length : 0,
        });
        this.task('register_commands', () => this.registerCommands());
        if (this.watch && !this.watchStarted) {
          this.watchStarted = true;
          this.task('watch_start', () => this.watch!.start());
        }
        return;
      case 'GUILD_CREATE': {
        if (data.unavailable) return;
        const guildId = String(data.id);
        if (this.watch) this.task('watch_reconcile', () => this.watch!.reconcile(guildId));
        this.task('announce_intro', () => withTimeout(this.pet.announceIntro(guildId), INTRO_TIMEOUT_MS));
        return;
      }
      case 'MESSAGE_CREATE':
        return this.onMessageCreate(data as Message);
      case 'INTERACTION_CREATE':
        this.task('interaction', () => this.onInteraction(data as Interaction));
        return;
      case 'VOICE_STATE_UPDATE':
        if (this.watch && data.guild_id) {
          const vs = toVoiceState(data, String(data.guild_id));
          this.task('watch_voice', () => this.watch!.handleVoiceState(vs));
        }
        return;
      case 'PRESENCE_UPDATE':
        if (this.watch) {
          const cs = (data.client_status ?? {}) as Record<string, string | undefined>;
          const input: PresenceInput = {
            user: data.user?.id ? { ...data.user, id: String(data.user.id) } : null,
            guildId: String(data.guild_id ?? ''),
            status: String(data.status ?? ''),
            activities: toActivities(data.activities),
            clientStatus: { desktop: cs.desktop, mobile: cs.mobile, web: cs.web },
          };
          this.task('watch_presence', () => this.watch!.handlePresence(input));
        }
        return;
      case 'MESSAGE_REACTION_ADD':
        if (this.watch) this.task('watch_reaction', () => this.watch!.handleReaction(data));
        return;
      case 'TYPING_START':
        if (this.watch) this.task('watch_typing', () => this.watch!.handleTyping(data));
        return;
    }
  }

  /** The tracker sees every guild message; Alex answers @mentions and replies to him. */
  private onMessageCreate(m: Message): void {
    if (!m.author || m.author.bot || !m.guild_id) return;
    this.task('message', async () => {
      if (this.watch) await this.watch.handleMessage(m);
      const botId = this.state.selfId;
      if (!mentionTarget(m, botId)) return;
      try {
        await this.chat.handleMention(m, botId, this.timeoutSignal(MENTION_TIMEOUT_MS));
      } catch (err) {
        this.log.warn({ event: 'discord_bot.mention_reply_failed', channelId: m.channel_id, err: (err as Error).message });
      }
    });
  }

  /** Bulk-register the commands (guild-scoped with DISCORD_DEV_GUILD_ID), keeping Entry Points. */
  async registerCommands(): Promise<void> {
    const guildId = this.cfg.devGuildId;
    if (restricted(this.guard) && !guildId) {
      this.log.info({ event: 'discord_bot.command_registration_skipped', reason: 'restricted run without DISCORD_DEV_GUILD_ID' });
      return;
    }
    let existing: CommandDefinition[] | null = null;
    try {
      existing = await this.port.getCommands(guildId);
    } catch (err) {
      this.log.error({ event: 'discord_bot.fetch_existing_commands_failed', err: (err as Error).message });
    }
    try {
      await this.port.overwriteCommands(guildId, commandsToRegister(existing));
    } catch (err) {
      this.log.error({ event: 'discord_bot.command_registration_failed', err: (err as Error).message });
      return;
    }
    this.log.info({ event: 'discord_bot.commands_registered', scope: guildId ? 'guild' : 'global', guildId });
  }

  async onInteraction(i: Interaction): Promise<void> {
    const signal = this.timeoutSignal(INTERACTION_TIMEOUT_MS);
    switch (i.type) {
      case InteractionType.ApplicationCommand:
        return this.routeCommand(i, signal);
      case InteractionType.MessageComponent:
        return this.routeComponent(i);
      case InteractionType.ModalSubmit:
        return this.routeModal(i, signal);
    }
  }

  private async routeCommand(i: Interaction, signal: AbortSignal): Promise<void> {
    const name = i.data?.name ?? '';
    const opts = new OptionMap(i.data?.options);
    const { id: userId } = interactionUser(i);
    this.log.info({ event: 'discord_bot.command_received', command: name, userId, guildId: i.guild_id ?? '' });
    const deny = (what: string) =>
      respondEphemeral(
        this.port,
        i,
        `🔒 You need to be the **server owner**, have the **Manage Messages** permission, or be the bot owner to change Alex's ${what} here.`,
      );
    const guildOwner = i.guild_id ? this.state.guild(i.guild_id)?.ownerId : undefined;
    try {
      switch (name) {
        case 'chat':
          return await this.chat.handleChat(i, opts.str('message'), true, signal);
        case 'alex':
          return await this.pet.handleStatus(i);
        case 'feed':
          return await this.pet.handleFeed(i, opts.str('food'));
        case 'play':
          return await this.pet.handlePlay(i);
        case 'clean':
          return await this.pet.handleClean(i);
        case 'rest':
          return await this.pet.handleRest(i);
        case 'study':
          return await this.pet.handleStudy(i);
        case 'career':
          return await this.pet.handleCareer(i, opts.str('path'));
        case 'show':
          return await this.pet.handleShow(i);
        case 'revive':
          return await this.pet.handleRevive(i);
        case 'newlife':
          return await this.pet.handleNewLife(i);
        case 'rename':
          return await this.pet.handleRename(i, opts.str('name'));
        case 'caretakers':
          return await this.pet.handleCaretakers(i);
        case 'alexmessages':
          if (!canToggleAlex(i, this.cfg.ownerId, guildOwner)) return await deny('messages').catch(() => undefined);
          return await this.pet.handleSetMessages(i, opts.str('level'));
        case 'prompt':
          if (!canToggleAlex(i, this.cfg.ownerId, guildOwner)) return await deny('personality').catch(() => undefined);
          return await this.chat.handlePrompt(i, opts.str('text'), opts.bool('reset'));
        default:
          this.log.warn({ event: 'discord_bot.unknown_command', name });
      }
    } catch (err) {
      this.log.error({ event: 'discord_bot.command_error', command: name, err: (err as Error).message });
    }
  }

  /** The owner (from the custom id) or the bot owner may continue a chat; others get an ephemeral no. */
  private async ownerOk(i: Interaction, ownerId: string): Promise<boolean> {
    const { id } = interactionUser(i);
    if (id === ownerId) return true;
    if (this.cfg.ownerId && id === this.cfg.ownerId) return true;
    await respondEphemeral(this.port, i, 'This chat belongs to another user — run `/chat` to start your own 💬').catch(
      () => undefined,
    );
    return false;
  }

  private async routeComponent(i: Interaction): Promise<void> {
    const [action, ownerId] = splitCustomId(i.data?.custom_id ?? '');
    if (action !== 'chat_continue') return;
    if (!(await this.ownerOk(i, ownerId))) return;
    await showModal(this.port, i, 'chat_continue_modal:' + ownerId, 'Keep talking with Alex 💬', 'message', 'What do you wanna say?').catch(
      () => undefined,
    );
  }

  private async routeModal(i: Interaction, signal: AbortSignal): Promise<void> {
    const [action, ownerId] = splitCustomId(i.data?.custom_id ?? '');
    if (action !== 'chat_continue_modal') return;
    if (!(await this.ownerOk(i, ownerId))) return;
    try {
      await this.chat.handleChat(i, modalValue(i, 'message'), false, signal);
    } catch (err) {
      this.log.error({ event: 'discord_bot.modal_error', customId: action, err: (err as Error).message });
    }
  }

  // ─── Cron-driven ticks (jobs.ts); each a no-op until the gateway is ready ───

  async careTick(): Promise<void> {
    if (!this.isReady()) return;
    await this.pet.careTick();
  }

  async watchFlush(): Promise<void> {
    if (!this.isReady() || !this.watch) return;
    await this.watch.flush();
  }

  async watchIdentities(): Promise<void> {
    if (!this.isReady() || !this.watch) return;
    await this.watch.refreshIdentities();
  }

  async summaryTick(): Promise<void> {
    if (!this.isReady() || !this.summarizer) return;
    await this.summarizer.tick(this.lifecycle.signal);
  }

  /**
   * Graceful stop: close the gateway first (no new events), give in-flight replies up to
   * `drainMs` to finish over REST, abort the rest, close the tracker's open sessions at now, and
   * in channel test mode delete every message this run posted.
   */
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.ready = false;
    this.log.info({ event: 'discord_bot.shutdown_start', inflight: this.inflight.size });
    await Promise.resolve(this.manager.destroy({ code: 1000, reason: 'shutdown' })).catch((err: Error) =>
      this.log.warn({ event: 'discord_bot.session_close_failed', err: err.message }),
    );
    const drained = await Promise.race([
      Promise.allSettled([...this.inflight]).then(() => true),
      sleep(this.cfg.drainMs).then(() => false),
    ]);
    if (!drained) this.log.warn({ event: 'discord_bot.drain_timeout', abandoned: this.inflight.size });
    this.lifecycle.abort();
    if (this.watch) await this.watch.closeAll('shutdown').catch(() => undefined);
    if (testMode(this.guard)) {
      const deleted = await this.port.cleanupTestMessages();
      this.log.info({ event: 'discord_bot.test_messages_deleted', deleted });
    }
    this.log.info({ event: 'discord_bot.shutdown_complete' });
  }

  /** The command definitions (for a read-only diff against what is registered). */
  static commandDefinitions(): CommandDefinition[] {
    return slashCommands();
  }

  /** Exposed for the live harness and tests. */
  get discord(): DiscordPort {
    return this.port;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, sleep(ms).then(() => undefined)]);
}
