/**
 * /vibe — build an RMH Vibes page from Discord. The command defers, streams the generator's
 * progress into the deferred reply (at most one edit per 2.5s), and ends on an embed with
 * Open / Play in Discord / Customize. Customize opens a modal whose submit runs the same flow
 * on the existing slug (the owner edits in place, everyone else remixes; generateVibeStream decides).
 *
 * The build runs for minutes, far beyond the bot's per-interaction timeout, so this flow takes
 * no abort signal: it is already a tracked task in bot.ts (drained on shutdown), and bounded by
 * the generator's own stall/total timers.
 */
import { prisma } from '../../lib/prisma.server';
import { rateLimit } from '../../lib/rate-limit';
import { findLinkedUserId } from '../../lib/discord-link.server';
import { generateVibeStream } from '../../lib/rmhvibe/vibe.server';
import { parsePartialProject } from '../../lib/rmhvibe/vibe-project';
import {
  InteractionResponse,
  type DiscordPort,
  type MessageBody,
} from './discord';
import {
  OptionMap,
  deferReply,
  interactionUser,
  modalValue,
  respondEphemeral,
  showModal,
  type Interaction,
} from './interactions';

/** Discord edits are rate limited per webhook; one progress edit per 2.5s is well inside it. */
const EDIT_INTERVAL_MS = 2500;
/** An interaction token is valid 15 minutes; past 14 the result is posted to the channel instead. */
const TOKEN_LIFETIME_MS =
  14 *
  60_000;
const PROMPT_TITLE_MAX = 80;
const RATE_LIMIT =
  {
    limit: 3,
    windowMs: 600_000,
    prefix:
      'vibe-bot',
    applyMultiplier: false,
  } as const;
const BUTTON_LINK = 5;
const BUTTON_PRIMARY = 1;
const BUTTON_SECONDARY = 2;
const ERROR_EMBED_COLOR = 0xe5484d;

export interface VibeDeps {
  generate: typeof generateVibeStream;
  findLinkedUserId: (
    discordId: string,
  ) => Promise<
    | string
    | null
  >;
  now: () => number;
  baseUrl: string;
  /** The screenshot the viewer page uses as og:image (a path or URL), once captured; null before. */
  thumbnailUrl?: (
    slug: string,
  ) => Promise<
    | string
    | null
  >;
}

export function defaultVibeDeps(
  baseUrl: string,
): VibeDeps {
  return {
    generate:
      generateVibeStream,
    findLinkedUserId,
    now: () =>
      Date.now(),
    baseUrl,
    thumbnailUrl:
      async (
        slug,
      ) => {
        const row =
          await prisma.vibePage.findUnique(
            {
              where:
                {
                  slug,
                },
              select:
                {
                  thumbnailUrl: true,
                  status: true,
                },
            },
          );
        return row?.status ===
          'ready'
          ? (row.thumbnailUrl ??
              null)
          : null;
      },
  };
}

function truncate(
  s: string,
  max: number,
): string {
  const t =
    s
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();
  return t.length >
    max
    ? t.slice(
        0,
        max -
          1,
      ) +
        '…'
    : t;
}

function absolute(
  baseUrl: string,
  path: string,
): string {
  return /^https?:\/\//.test(
    path,
  )
    ? path
    : baseUrl.replace(
        /\/$/,
        '',
      ) +
        path;
}

function progressText(
  raw: string,
): string {
  if (
    !raw
  )
    return 'Thinking';
  const p =
    parsePartialProject(
      raw,
    );
  if (
    !p.writing
  )
    return 'Thinking';
  return `Writing **${p.writing}** · ${p.done.length} files done`;
}

export interface VibeRequest {
  prompt: string;
  widget?: boolean;
  /** Set for Customize: the vibe to change (owner edits in place, anyone else remixes). */
  slug?: string;
}

/** Run one build and report it in the deferred reply. Never throws for a failed build. */
export async function runVibe(
  port: DiscordPort,
  i: Interaction,
  req: VibeRequest,
  deps: VibeDeps,
): Promise<void> {
  const {
    id: discordId,
  } =
    interactionUser(
      i,
    );
  const rl =
    rateLimit(
      'discord:' +
        discordId,
      RATE_LIMIT,
    );
  if (
    !rl.allowed
  ) {
    await respondEphemeral(
      port,
      i,
      'You can build 3 vibes every 10 minutes.',
    );
    return;
  }
  await deferReply(
    port,
    i,
  );

  const started =
    deps.now();
  const title = `Building: ${truncate(req.prompt, PROMPT_TITLE_MAX)}`;
  // Past the token's life (or when an edit is refused) results go to the channel instead.
  let viaChannel = false;
  const publish =
    async (
      body: MessageBody,
    ): Promise<void> => {
      if (
        !viaChannel &&
        deps.now() -
          started <
          TOKEN_LIFETIME_MS
      ) {
        try {
          if (
            await port.editOriginal(
              i.token,
              body,
            )
          )
            return;
        } catch {
          // fall through to the channel
        }
      }
      viaChannel = true;
      if (
        i.channel_id
      )
        await port
          .send(
            i.channel_id,
            body,
          )
          .catch(
            () =>
              undefined,
          );
    };

  let content =
    '';
  let lastEdit =
    started;
  try {
    const userId =
      await deps.findLinkedUserId(
        discordId,
      );
    for await (const ev of deps.generate(
      {
        prompt:
          req.prompt,
        slug: req.slug,
        userId,
        kind: req.widget
          ? 'widget'
          : 'page',
      },
    )) {
      if (
        ev.type ===
        'content'
      ) {
        content +=
          ev.text;
      } else if (
        ev.type ===
        'error'
      ) {
        await publish(
          {
            embeds:
              [
                {
                  title:
                    'Could not build that vibe',
                  description:
                    truncate(
                      ev.message,
                      1000,
                    ),
                  color:
                    ERROR_EMBED_COLOR,
                },
              ],
          },
        );
        return;
      } else if (
        ev.type ===
        'done'
      ) {
        await publish(
          await doneBody(
            deps,
            ev,
          ),
        );
        return;
      }
      const now =
        deps.now();
      if (
        !viaChannel &&
        now -
          lastEdit >=
          EDIT_INTERVAL_MS &&
        now -
          started <
          TOKEN_LIFETIME_MS
      ) {
        lastEdit =
          now;
        await publish(
          {
            embeds:
              [
                {
                  title,
                  description:
                    progressText(
                      content,
                    ),
                },
              ],
          },
        );
      }
    }
    // The stream ended without a result: treat it as a failed build.
    await publish(
      {
        embeds:
          [
            {
              title:
                'Could not build that vibe',
              description:
                'The build ended early. Try again.',
              color:
                ERROR_EMBED_COLOR,
            },
          ],
      },
    );
  } catch (err) {
    await publish(
      {
        embeds:
          [
            {
              title:
                'Could not build that vibe',
              description:
                truncate(
                  (
                    err as Error
                  )
                    .message ||
                    'Something went wrong.',
                  1000,
                ),
              color:
                ERROR_EMBED_COLOR,
            },
          ],
      },
    );
  }
}

async function doneBody(
  deps: VibeDeps,
  ev: {
    slug: string;
    title: string;
    description: string;
  },
): Promise<MessageBody> {
  const url =
    deps.baseUrl.replace(
      /\/$/,
      '',
    ) +
    '/v/' +
    ev.slug;
  const thumb =
    await deps
      .thumbnailUrl?.(
        ev.slug,
      )
      .catch(
        () =>
          null,
      );
  return {
    embeds:
      [
        {
          title:
            truncate(
              ev.title ||
                'Your vibe',
              256,
            ),
          description:
            truncate(
              ev.description ||
                '',
              400,
            ),
          url,
          ...(thumb
            ? {
                image:
                  {
                    url: absolute(
                      deps.baseUrl,
                      thumb,
                    ),
                  },
              }
            : {}),
          footer:
            {
              text: 'RMH Vibes',
            },
        },
      ],
    components:
      [
        {
          type: 1,
          components:
            [
              {
                type: 2,
                style:
                  BUTTON_LINK,
                label:
                  'Open',
                url,
              },
              {
                type: 2,
                style:
                  BUTTON_PRIMARY,
                label:
                  'Play in Discord',
                custom_id:
                  'vibe_play:' +
                  ev.slug,
              },
              {
                type: 2,
                style:
                  BUTTON_SECONDARY,
                label:
                  'Customize',
                custom_id:
                  'vibe_edit:' +
                  ev.slug,
              },
            ],
        },
      ],
  };
}

/** `/vibe prompt: widget:` */
export function handleVibeCommand(
  port: DiscordPort,
  i: Interaction,
  deps: VibeDeps,
): Promise<void> {
  const opts =
    new OptionMap(
      i
        .data
        ?.options,
    );
  return runVibe(
    port,
    i,
    {
      prompt:
        opts
          .str(
            'prompt',
          )
          .trim(),
      widget:
        opts.bool(
          'widget',
        ),
    },
    deps,
  );
}

/** The Customize button: ask what to change. */
export function handleVibeEditButton(
  port: DiscordPort,
  i: Interaction,
  slug: string,
): Promise<void> {
  return showModal(
    port,
    i,
    'vibe_edit_modal:' +
      slug,
    'Customize vibe',
    'instruction',
    'What should change?',
  );
}

/** The Customize modal submit: the same build flow, on the existing slug. */
export function handleVibeEditModal(
  port: DiscordPort,
  i: Interaction,
  slug: string,
  deps: VibeDeps,
): Promise<void> {
  return runVibe(
    port,
    i,
    {
      prompt:
        modalValue(
          i,
          'instruction',
        ).trim(),
      slug,
    },
    deps,
  );
}

/** The Play button: queue the launch for the Activity and open it; fall back to the link. */
export async function handleVibePlay(
  port: DiscordPort,
  i: Interaction,
  slug: string,
  baseUrl: string,
): Promise<void> {
  try {
    if (
      !i.channel_id
    )
      throw new Error(
        'no channel',
      );
    await prisma.discordVibeLaunch.create(
      {
        data: {
          channelId:
            i.channel_id,
          slug,
        },
      },
    );
    await port.respond(
      i,
      {
        type: InteractionResponse.LaunchActivity,
      },
    );
  } catch {
    const url =
      baseUrl.replace(
        /\/$/,
        '',
      ) +
      '/v/' +
      slug;
    await respondEphemeral(
      port,
      i,
      `Activities are not available here. Open it at ${url}`,
    ).catch(
      () =>
        undefined,
    );
  }
}
