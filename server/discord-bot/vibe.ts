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
const PLAY_RATE_LIMIT =
  {
    limit: 10,
    windowMs: 60_000,
    prefix:
      'vibe-play',
    applyMultiplier: false,
  } as const;
/** Discord wants a button response within 3s; the launch bookkeeping gets this much of it. */
const PLAY_DB_BUDGET_MS = 2000;
const PLAY_DEDUPE_MS = 60_000;
const SLUG_RE =
  /^[a-z0-9-]{1,64}$/;
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

const errorBody =
  (
    description: string,
  ): MessageBody => ({
    embeds:
      [
        {
          title:
            'Could not build that vibe',
          description:
            truncate(
              description,
              1000,
            ),
          color:
            ERROR_EMBED_COLOR,
        },
      ],
  });

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
  if (
    !req.prompt
  ) {
    await respondEphemeral(
      port,
      i,
      'Describe what you want to build.',
    );
    return;
  }
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
  const tokenAlive =
    () =>
      deps.now() -
        started <
      TOKEN_LIFETIME_MS;

  /** A progress edit: a failed or throttled one is skipped, the next tick tries again. */
  const progress =
    async (
      body: MessageBody,
    ): Promise<void> => {
      if (
        !tokenAlive()
      )
        return;
      try {
        await port.editOriginal(
          i.token,
          body,
        );
      } catch {
        // skippable
      }
    };
  /** The final body must land: edit the reply, else (failed edit or expired token) post to the channel. */
  const finish =
    async (
      body: MessageBody,
    ): Promise<void> => {
      if (
        tokenAlive()
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
        await finish(
          errorBody(
            ev.message,
          ),
        );
        return;
      } else if (
        ev.type ===
        'done'
      ) {
        await finish(
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
        now -
          lastEdit >=
        EDIT_INTERVAL_MS
      ) {
        lastEdit =
          now;
        await progress(
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
    await finish(
      errorBody(
        'The build ended early. Try again.',
      ),
    );
  } catch (err) {
    await finish(
      errorBody(
        (
          err as Error
        )
          .message ||
          'Something went wrong.',
      ),
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
export async function handleVibeEditButton(
  port: DiscordPort,
  i: Interaction,
  slug: string,
): Promise<void> {
  if (
    !SLUG_RE.test(
      slug,
    )
  )
    return;
  await showModal(
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
export async function handleVibeEditModal(
  port: DiscordPort,
  i: Interaction,
  slug: string,
  deps: VibeDeps,
): Promise<void> {
  if (
    !SLUG_RE.test(
      slug,
    )
  )
    return;
  await runVibe(
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

/** Record the launch (so the Activity can preselect the vibe) unless it is bogus or just recorded. */
async function recordLaunch(
  channelId: string,
  slug: string,
): Promise<void> {
  const page =
    await prisma.vibePage.findUnique(
      {
        where:
          {
            slug,
          },
        select:
          {
            status: true,
          },
      },
    );
  if (
    page?.status !==
    'ready'
  )
    return;
  const recent =
    await prisma.discordVibeLaunch.findFirst(
      {
        where:
          {
            channelId,
            slug,
            createdAt:
              {
                gte: new Date(
                  Date.now() -
                    PLAY_DEDUPE_MS,
                ),
              },
          },
        select:
          {
            id: true,
          },
      },
    );
  if (
    recent
  )
    return;
  await prisma.discordVibeLaunch.create(
    {
      data: {
        channelId,
        slug,
      },
    },
  );
}

/** The Play button: queue the launch for the Activity and open it; fall back to the link. */
export async function handleVibePlay(
  port: DiscordPort,
  i: Interaction,
  slug: string,
  baseUrl: string,
): Promise<void> {
  if (
    !SLUG_RE.test(
      slug,
    )
  )
    return;
  const {
    id: discordId,
  } =
    interactionUser(
      i,
    );
  if (
    rateLimit(
      'discord:' +
        discordId,
      PLAY_RATE_LIMIT,
    )
      .allowed &&
    i.channel_id
  ) {
    // Time-boxed: past the budget the Activity launches anyway, it just will not preselect.
    let timer:
      | ReturnType<
          typeof setTimeout
        >
      | undefined;
    await Promise.race(
      [
        recordLaunch(
          i.channel_id,
          slug,
        ).catch(
          () =>
            undefined,
        ),
        new Promise<void>(
          (
            resolve,
          ) => {
            timer =
              setTimeout(
                resolve,
                PLAY_DB_BUDGET_MS,
              );
          },
        ),
      ],
    );
    clearTimeout(
      timer,
    );
  }
  try {
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
