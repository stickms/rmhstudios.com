/**
 * Interaction glue (port of discordbot/interactions.go plus the command table from bot.go): the
 * slash-command definitions, reading the invoking user and options off a raw interaction,
 * "action:ownerId" custom ids, the keep-talking modal and the plain-text reply helpers.
 */
import {
  InteractionResponse,
  MESSAGE_FLAG_EPHEMERAL,
  type CommandDefinition,
  type DiscordPort,
  type Embed,
  type User,
} from './discord';

export interface Interaction {
  id: string;
  application_id?: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: {
    user?: User;
    permissions?: string;
  };
  user?: User;
  data?: {
    name?: string;
    options?: Array<{
      name: string;
      type: number;
      value?: unknown;
    }>;
    custom_id?: string;
    components?: Array<{
      type: number;
      components?: Array<{
        type: number;
        custom_id?: string;
        value?: string;
      }>;
    }>;
  };
}

export const InteractionType =
  {
    ApplicationCommand: 2,
    MessageComponent: 3,
    ModalSubmit: 5,
  } as const;

const OPTION_STRING = 3;
const OPTION_BOOLEAN = 5;

/** The prompt length cap, also enforced by the /prompt option's max_length. */
export const PROMPT_MAX_LEN = 2000;

/** The slash commands, exactly as the Go bot registered them. */
export function slashCommands(): CommandDefinition[] {
  return [
    {
      name: 'chat',
      description:
        'Chat with Alex 💬',
      options:
        [
          {
            type: OPTION_STRING,
            name: 'message',
            description:
              'What do you wanna say?',
            required: true,
          },
        ],
    },
    {
      name: 'alex',
      description:
        'Check on Alex — his stats, age, and mood 🧋',
    },
    {
      name: 'feed',
      description:
        'Feed Alex to fill his hunger 🍽️',
      options:
        [
          {
            type: OPTION_STRING,
            name: 'food',
            description:
              'What to feed him (defaults to boba)',
            required: false,
            choices:
              [
                {
                  name: '🧋 Boba (his fave)',
                  value:
                    'boba',
                },
                {
                  name: '🍜 A full meal',
                  value:
                    'meal',
                },
                {
                  name: '🍪 A snack',
                  value:
                    'snack',
                },
              ],
          },
        ],
    },
    {
      name: 'play',
      description:
        'Play with Alex to boost his happiness 🎮',
    },
    {
      name: 'clean',
      description:
        "Clean Alex up so he doesn't get funky 🧼",
    },
    {
      name: 'rest',
      description:
        'Put Alex down for a nap to restore energy 😴',
    },
    {
      name: 'study',
      description:
        'Help Alex study to build his intelligence 🧠',
    },
    {
      name: 'career',
      description:
        "Set Alex's dream career — a preset or ANY career you type (or view it) 🎯",
      options:
        [
          {
            type: OPTION_STRING,
            name: 'path',
            description:
              'swe/data/founder/quant/pm/design — or type any dream career (blank = view)',
            required: false,
          },
        ],
    },
    {
      name: 'show',
      description:
        'See a pic of what Alex looks like right now 📸',
    },
    {
      name: 'revive',
      description:
        "Bring Alex back if he's passed out ✨",
    },
    {
      name: 'newlife',
      description:
        'Start a New Game+ once Alex is a grown adult 🎓',
    },
    {
      name: 'caretakers',
      description:
        "See who's taken the best care of Alex 🏆",
    },
    {
      name: 'alexmessages',
      description:
        "Set Alex's messages in this server (Manage Messages / owner only) 🔔",
      options:
        [
          {
            type: OPTION_STRING,
            name: 'level',
            description:
              'How much Alex talks here (blank = show current)',
            required: false,
            choices:
              [
                {
                  name: '🔔 All messages',
                  value:
                    'all',
                },
                {
                  name: '🩹 Care messages only',
                  value:
                    'care',
                },
                {
                  name: '🔕 Completely silent',
                  value:
                    'off',
                },
              ],
          },
        ],
    },
    {
      name: 'rename',
      description:
        'Give Alex a new name 📝',
      options:
        [
          {
            type: OPTION_STRING,
            name: 'name',
            description:
              "Alex's new name (1–32 characters)",
            required: true,
          },
        ],
    },
    {
      name: 'prompt',
      description:
        "Set Alex's personality for this server — for /chat + @mentions (Manage Messages / owner) 🧠",
      options:
        [
          {
            type: OPTION_STRING,
            name: 'text',
            description:
              'New personality prompt (blank = view current)',
            required: false,
            max_length:
              PROMPT_MAX_LEN,
          },
          {
            type: OPTION_BOOLEAN,
            name: 'reset',
            description:
              'Reset Alex back to his default personality',
            required: false,
          },
        ],
    },
  ];
}

/** The invoking user's id and username (guild member first, then DM user). */
export function interactionUser(
  i: Interaction,
): {
  id: string;
  username: string;
} {
  const u =
    i
      .member
      ?.user ??
    i.user;
  return {
    id:
      u?.id ??
      '',
    username:
      u?.username ??
      '',
  };
}

/** The invoking user's avatar hash ("" when they have none). */
export function interactionAvatar(
  i: Interaction,
): string {
  return (
    (
      i
        .member
        ?.user ??
      i.user
    )
      ?.avatar ??
    ''
  );
}

/** Name → option lookup with Go's zero-value semantics. */
export class OptionMap {
  private readonly byName =
    new Map<
      string,
      {
        type: number;
        value?: unknown;
      }
    >();

  constructor(
    options?: Array<{
      name: string;
      type: number;
      value?: unknown;
    }>,
  ) {
    for (const o of options ??
      [])
      this.byName.set(
        o.name,
        o,
      );
  }

  str(
    name: string,
  ): string {
    const v =
      this.byName.get(
        name,
      )?.value;
    return typeof v ===
      'string'
      ? v
      : v ===
            undefined ||
          v ===
            null
        ? ''
        : String(
            v,
          );
  }

  bool(
    name: string,
  ): boolean {
    return (
      this.byName.get(
        name,
      )
        ?.value ===
      true
    );
  }
}

/** "action:ownerId" → [action, ownerId] (only the first colon splits). */
export function splitCustomId(
  customId: string,
): [
  string,
  string,
] {
  const i =
    customId.indexOf(
      ':',
    );
  return i <
    0
    ? [
        customId,
        '',
      ]
    : [
        customId.slice(
          0,
          i,
        ),
        customId.slice(
          i +
            1,
        ),
      ];
}

/** A submitted modal's text-input value by component id. */
export function modalValue(
  i: Interaction,
  inputId: string,
): string {
  for (const row of i
    .data
    ?.components ??
    []) {
    if (
      row.type !==
      1
    )
      continue;
    for (const c of row.components ??
      []) {
      if (
        c.type ===
          4 &&
        c.custom_id ===
          inputId
      )
        return (
          c.value ??
          ''
        );
    }
  }
  return '';
}

export function showModal(
  port: DiscordPort,
  i: Interaction,
  customId: string,
  title: string,
  inputId: string,
  label: string,
): Promise<void> {
  return port.respond(
    i,
    {
      type: InteractionResponse.Modal,
      data: {
        custom_id:
          customId,
        title,
        components:
          [
            {
              type: 1,
              components:
                [
                  {
                    type: 4,
                    custom_id:
                      inputId,
                    label,
                    style: 2,
                    required: true,
                    max_length: 1000,
                  },
                ],
            },
          ],
      },
    },
  );
}

export function respondText(
  port: DiscordPort,
  i: Interaction,
  content: string,
): Promise<void> {
  return port.respond(
    i,
    {
      type: InteractionResponse.ChannelMessageWithSource,
      data: {
        content,
      },
    },
  );
}

export function respondEphemeral(
  port: DiscordPort,
  i: Interaction,
  content: string,
): Promise<void> {
  return port.respond(
    i,
    {
      type: InteractionResponse.ChannelMessageWithSource,
      data: {
        content,
        flags:
          MESSAGE_FLAG_EPHEMERAL,
      },
    },
  );
}

export function respondEphemeralEmbed(
  port: DiscordPort,
  i: Interaction,
  embed: Embed,
): Promise<void> {
  return port.respond(
    i,
    {
      type: InteractionResponse.ChannelMessageWithSource,
      data: {
        embeds:
          [
            embed,
          ],
        flags:
          MESSAGE_FLAG_EPHEMERAL,
      },
    },
  );
}

export function deferReply(
  port: DiscordPort,
  i: Interaction,
): Promise<void> {
  return port.respond(
    i,
    {
      type: InteractionResponse.DeferredChannelMessageWithSource,
    },
  );
}

const PERM_ADMINISTRATOR =
  1n <<
  3n;
const PERM_MANAGE_MESSAGES =
  1n <<
  13n;

/** The member's resolved permission bitfield (0 when absent or malformed). */
export function memberPermissions(
  i: Interaction,
): bigint {
  try {
    return BigInt(
      i
        .member
        ?.permissions ??
        '0',
    );
  } catch {
    return 0n;
  }
}

/**
 * May this user change Alex's per-server settings (/alexmessages, /prompt)? The bot owner
 * (OWNER_ID, trimmed), the server's own owner, or a member with Manage Messages / Administrator.
 */
export function canToggleAlex(
  i: Interaction,
  ownerId: string,
  guildOwnerId:
    | string
    | undefined,
): boolean {
  const {
    id,
  } =
    interactionUser(
      i,
    );
  const owner =
    ownerId.trim();
  if (
    owner !==
      '' &&
    id ===
      owner
  )
    return true;
  if (
    i.guild_id &&
    guildOwnerId &&
    guildOwnerId ===
      id
  )
    return true;
  if (
    i.member
  ) {
    const p =
      memberPermissions(
        i,
      );
    if (
      (p &
        PERM_MANAGE_MESSAGES) !==
        0n ||
      (p &
        PERM_ADMINISTRATOR) !==
        0n
    )
      return true;
  }
  return false;
}
