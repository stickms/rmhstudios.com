/**
 * The bot's narrow view of Discord: the handful of REST calls it makes, behind one interface the
 * services depend on, so handlers are tested against a fake and every outbound request passes the
 * guard (guard.ts) in one place.
 *
 * Shapes are the raw API's (snake_case), trimmed to the fields the bot reads.
 */
import type {
  REST,
  RawFile,
} from '@discordjs/rest';
import {
  checkRoute,
  prefixTestContent,
  restricted,
  testMode,
  type GuardConfig,
} from './guard';

export interface User {
  id: string;
  username?: string;
  global_name?:
    | string
    | null;
  avatar?:
    | string
    | null;
  bot?: boolean;
}

export interface MessageReference {
  message_id?: string;
  channel_id?: string;
  guild_id?: string;
}

export interface Message {
  id: string;
  channel_id: string;
  guild_id?: string;
  author?: User;
  content?: string;
  timestamp?: string;
  mentions?: User[];
  attachments?: unknown[];
  embeds?: unknown[];
  sticker_items?: unknown[];
  message_reference?: MessageReference | null;
  referenced_message?: Message | null;
  webhook_id?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: {
    text: string;
  };
  image?: {
    url: string;
  };
}

export interface MessageBody {
  content?: string;
  embeds?: Embed[];
  components?: unknown[];
  flags?: number;
  allowed_mentions?: {
    parse: string[];
  };
  message_reference?: MessageReference & {
    fail_if_not_exists?: boolean;
  };
}

export interface FileUpload {
  name: string;
  data: Buffer;
  contentType: string;
}

export interface InteractionRef {
  id: string;
  token: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  type?: number;
  options?: unknown[];
  [
    key: string
  ]: unknown;
}

/** Error from a REST call: `status` is the HTTP status, `code` Discord's JSON error code. */
export interface DiscordError extends Error {
  status?: number;
  code?:
    | number
    | string;
}

/** Refused by the guard before it left the process. */
export class GuardRefusal extends Error {
  readonly status = 0;
  constructor(
    reason: string,
  ) {
    super(
      `guard refused: ${reason}`,
    );
    this.name =
      'GuardRefusal';
  }
}

export interface DiscordPort {
  respond(
    i: InteractionRef,
    response: {
      type: number;
      data?: unknown;
    },
    files?: FileUpload[],
  ): Promise<void>;
  editOriginal(
    token: string,
    body: MessageBody,
    files?: FileUpload[],
  ): Promise<Message | null>;
  send(
    channelId: string,
    body: MessageBody,
    files?: FileUpload[],
  ): Promise<Message>;
  getMessages(
    channelId: string,
    query: {
      limit: number;
      before?: string;
    },
  ): Promise<
    Message[]
  >;
  getMessage(
    channelId: string,
    messageId: string,
  ): Promise<Message>;
  deleteMessage(
    channelId: string,
    messageId: string,
  ): Promise<void>;
  typing(
    channelId: string,
  ): Promise<void>;
  getUser(
    userId: string,
  ): Promise<User>;
  getCommands(
    guildId: string,
  ): Promise<
    CommandDefinition[]
  >;
  overwriteCommands(
    guildId: string,
    commands: CommandDefinition[],
  ): Promise<
    CommandDefinition[]
  >;
  /** Gateway presence (op 3). Suppressed while restricted: presence is shared by every guild. */
  updatePresence(presence: {
    status: string;
    activities: unknown[];
  }): void;
}

export const InteractionResponse =
  {
    ChannelMessageWithSource: 4,
    DeferredChannelMessageWithSource: 5,
    Modal: 9,
  } as const;

export const MESSAGE_FLAG_EPHEMERAL =
  1 <<
  6;

export interface PortDeps {
  rest: REST;
  guard: GuardConfig;
  selfId: () => string;
  applicationId: () => string;
  channelGuild: (
    channelId: string,
  ) =>
    | string
    | undefined;
  sendPresence: (
    d: unknown,
  ) => void;
  logger: {
    warn(
      fields: Record<
        string,
        unknown
      >,
    ): void;
    info(
      fields: Record<
        string,
        unknown
      >,
    ): void;
  };
}

function rawFiles(
  files?: FileUpload[],
):
  | RawFile[]
  | undefined {
  return files?.length
    ? files.map(
        (
          f,
        ) => ({
          name: f.name,
          data: f.data,
          contentType:
            f.contentType,
        }),
      )
    : undefined;
}

/** The real port over @discordjs/rest, with the guard and the test-mode ledger. */
export class RestDiscordPort implements DiscordPort {
  /** Messages created while in channel test mode, deleted again by `cleanupTestMessages`. */
  private readonly created: Array<{
    channelId: string;
    id: string;
  }> =
    [];

  constructor(
    private readonly deps: PortDeps,
  ) {}

  private check(
    method: string,
    route: string,
  ): void {
    const verdict =
      checkRoute(
        this
          .deps
          .guard,
        {
          method,
          route,
        },
        {
          selfId:
            this.deps.selfId(),
          channelGuild:
            this
              .deps
              .channelGuild,
        },
      );
    if (
      !verdict.ok
    ) {
      this.deps.logger.warn(
        {
          event:
            'discord_bot.guard_refused',
          method,
          route,
          reason:
            verdict.reason,
        },
      );
      throw new GuardRefusal(
        verdict.reason,
      );
    }
  }

  private body<
    T extends
      MessageBody,
  >(
    b: T,
  ): T {
    return testMode(
      this
        .deps
        .guard,
    )
      ? prefixTestContent(
          b,
        )
      : b;
  }

  async respond(
    i: InteractionRef,
    response: {
      type: number;
      data?: unknown;
    },
    files?: FileUpload[],
  ): Promise<void> {
    const route =
      `/interactions/${i.id}/${i.token}/callback` as const;
    this.check(
      'POST',
      route,
    );
    await this.deps.rest.post(
      route,
      {
        body: response,
        files:
          rawFiles(
            files,
          ),
        auth: false,
      },
    );
  }

  async editOriginal(
    token: string,
    body: MessageBody,
    files?: FileUpload[],
  ): Promise<Message | null> {
    const route =
      `/webhooks/${this.deps.applicationId()}/${token}/messages/@original` as const;
    this.check(
      'PATCH',
      route,
    );
    return (await this.deps.rest.patch(
      route,
      {
        body: this.body(
          body,
        ),
        files:
          rawFiles(
            files,
          ),
        auth: false,
      },
    )) as Message;
  }

  async send(
    channelId: string,
    body: MessageBody,
    files?: FileUpload[],
  ): Promise<Message> {
    const route =
      `/channels/${channelId}/messages` as const;
    this.check(
      'POST',
      route,
    );
    if (
      testMode(
        this
          .deps
          .guard,
      ) &&
      this
        .created
        .length >=
        this
          .deps
          .guard
          .maxTestMessages
    ) {
      throw new GuardRefusal(
        `test-mode message cap (${this.deps.guard.maxTestMessages}) reached`,
      );
    }
    const msg =
      (await this.deps.rest.post(
        route,
        {
          body: this.body(
            body,
          ),
          files:
            rawFiles(
              files,
            ),
        },
      )) as Message;
    if (
      testMode(
        this
          .deps
          .guard,
      )
    ) {
      this.created.push(
        {
          channelId,
          id: msg.id,
        },
      );
      this.deps.logger.info(
        {
          event:
            'discord_bot.test_message_created',
          channelId,
          messageId:
            msg.id,
        },
      );
    }
    return msg;
  }

  async getMessages(
    channelId: string,
    query: {
      limit: number;
      before?: string;
    },
  ): Promise<
    Message[]
  > {
    const route =
      `/channels/${channelId}/messages` as const;
    this.check(
      'GET',
      route,
    );
    const q =
      new URLSearchParams(
        {
          limit:
            String(
              query.limit,
            ),
        },
      );
    if (
      query.before
    )
      q.set(
        'before',
        query.before,
      );
    const msgs =
      (await this.deps.rest.get(
        route,
        {
          query:
            q,
        },
      )) as Message[];
    // Channel test mode: other people's messages never leave this method (not read, not logged,
    // never fed to a model) — only the bot's own posts make up the context.
    return testMode(
      this
        .deps
        .guard,
    )
      ? msgs.filter(
          (
            m,
          ) =>
            m
              .author
              ?.id ===
            this.deps.selfId(),
        )
      : msgs;
  }

  async getMessage(
    channelId: string,
    messageId: string,
  ): Promise<Message> {
    const route =
      `/channels/${channelId}/messages/${messageId}` as const;
    this.check(
      'GET',
      route,
    );
    const msg =
      (await this.deps.rest.get(
        route,
      )) as Message;
    if (
      testMode(
        this
          .deps
          .guard,
      ) &&
      msg
        .author
        ?.id !==
        this.deps.selfId()
    ) {
      throw new GuardRefusal(
        "another user's message is not read in channel test mode",
      );
    }
    return msg;
  }

  async deleteMessage(
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const route =
      `/channels/${channelId}/messages/${messageId}` as const;
    this.check(
      'DELETE',
      route,
    );
    await this.deps.rest.delete(
      route,
    );
  }

  async typing(
    channelId: string,
  ): Promise<void> {
    const route =
      `/channels/${channelId}/typing` as const;
    this.check(
      'POST',
      route,
    );
    await this.deps.rest.post(
      route,
    );
  }

  async getUser(
    userId: string,
  ): Promise<User> {
    const route =
      `/users/${userId}` as const;
    this.check(
      'GET',
      route,
    );
    return (await this.deps.rest.get(
      route,
    )) as User;
  }

  private commandsRoute(
    guildId: string,
  ): `/${string}` {
    const app =
      this.deps.applicationId();
    return guildId
      ? `/applications/${app}/guilds/${guildId}/commands`
      : `/applications/${app}/commands`;
  }

  async getCommands(
    guildId: string,
  ): Promise<
    CommandDefinition[]
  > {
    const route =
      this.commandsRoute(
        guildId,
      );
    this.check(
      'GET',
      route,
    );
    return (await this.deps.rest.get(
      route,
    )) as CommandDefinition[];
  }

  async overwriteCommands(
    guildId: string,
    commands: CommandDefinition[],
  ): Promise<
    CommandDefinition[]
  > {
    const route =
      this.commandsRoute(
        guildId,
      );
    this.check(
      'PUT',
      route,
    );
    return (await this.deps.rest.put(
      route,
      {
        body: commands,
      },
    )) as CommandDefinition[];
  }

  updatePresence(presence: {
    status: string;
    activities: unknown[];
  }): void {
    if (
      restricted(
        this
          .deps
          .guard,
      )
    )
      return;
    this.deps.sendPresence(
      {
        since:
          null,
        afk: false,
        ...presence,
      },
    );
  }

  /** Delete every message this process created in test mode (shutdown). */
  async cleanupTestMessages(): Promise<number> {
    let deleted = 0;
    while (
      this
        .created
        .length
    ) {
      const m =
        this.created.pop()!;
      try {
        await this.deleteMessage(
          m.channelId,
          m.id,
        );
        deleted++;
      } catch (err) {
        this.deps.logger.warn(
          {
            event:
              'discord_bot.test_message_delete_failed',
            messageId:
              m.id,
            err: (
              err as Error
            )
              .message,
          },
        );
      }
    }
    return deleted;
  }
}

/** Discord JSON error codes the bot acts on. */
export const ERR_UNKNOWN_CHANNEL = 10003;
export const ERR_MISSING_ACCESS = 50001;
export const ERR_MISSING_PERMISSIONS = 50013;

export function discordCode(
  err: unknown,
):
  | number
  | undefined {
  const c =
    (
      err as
        | DiscordError
        | undefined
    )
      ?.code;
  return typeof c ===
    'number'
    ? c
    : undefined;
}

export function discordStatus(
  err: unknown,
):
  | number
  | undefined {
  const s =
    (
      err as
        | DiscordError
        | undefined
    )
      ?.status;
  return typeof s ===
    'number' &&
    s >
      0
    ? s
    : undefined;
}

/** A send that will fail identically on every retry (Go permanentDiscordError: 400/401/403/404). */
export function permanentDiscordError(
  err: unknown,
): boolean {
  const s =
    discordStatus(
      err,
    );
  return (
    s ===
      400 ||
    s ===
      401 ||
    s ===
      403 ||
    s ===
      404
  );
}
