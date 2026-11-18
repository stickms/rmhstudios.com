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
import { assertVibeAllowed } from '../../lib/ai/vibe-budget.server';
import { isAppError } from '../../lib/errors/codes';
import { VIBE_BUDGET_SCOPE, VIBE_BUSY_SCOPE } from '../../lib/ai/vibe-tasks';
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
/** Process-wide cap on builds running at once: each is minutes of model time and a bundle. */
const MAX_CONCURRENT_BUILDS = 2;
let activeBuilds = 0;
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
  /^[a-z0-9_-]{1,64}$/;
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
  /**
   * The spend gate, run before a build starts: the platform's daily vibe cap, then the linked
   * user's monthly vibe ceiling. Absent = no gate (tests that do not exercise it).
   */
  gate?: (
    userId: string | null,
  ) => Promise<'ok' | 'budget' | 'busy'>;
  /** Waits `ms` for the late-thumbnail follow-up; absent = no follow-up. */
  sleep?: (
    ms: number,
  ) => Promise<void>;
  /** The screenshot the viewer page uses as og:image (a path or URL), once captured; null before. */
  thumbnailUrl?: (
    slug: string,
  ) => Promise<
    | string
    | null
  >;
}

/** Map the budget errors to the two refusals the bot words itself; anything else is allowed. */
async function defaultVibeGate(
  userId: string | null,
): Promise<'ok' | 'budget' | 'busy'> {
  try {
    await assertVibeAllowed(userId);
    return 'ok';
  } catch (err) {
    if (isAppError(err)) {
      const scope = err.detail?.scope;
      if (err.code === 'AI_UNAVAILABLE' && scope === VIBE_BUSY_SCOPE) return 'busy';
      if (err.code === 'AI_BUDGET_EXCEEDED' && scope === VIBE_BUDGET_SCOPE) return 'budget';
    }
    return 'ok';
  }
}

/**
 * Replies of builds still running, so shutdown can say so instead of leaving "Building…" on the
 * message forever. A build removes itself when it finishes.
 */
const liveReplies = new Set<{
  stop: () => Promise<void>;
}>();
let draining = false;

/** The bot is stopping and a build is being abandoned: edit each unfinished reply to a fixed note. */
export async function abandonVibeBuilds(): Promise<void> {
  draining = true;
  await Promise.allSettled(
    [...liveReplies].map(
      (r) =>
        r.stop(),
    ),
  );
  liveReplies.clear();
}

/** Late-thumbnail follow-ups: the screenshot lands about a minute after the build, so look twice. */
const THUMB_FOLLOWUP_DELAYS_MS = [75_000, 150_000];

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
    gate: defaultVibeGate,
    sleep: (ms) =>
      new Promise((resolve) => {
        // unref: a pending follow-up must never hold the process open at shutdown.
        setTimeout(resolve, ms).unref?.();
      }),
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

/**
 * Neutralise Discord markdown in text a model wrote (titles, descriptions), so a vibe called
 * `[free nitro](https://…)` renders literally.
 */
export function escapeMarkdown(s: string): string {
  return s.replace(/[\\*_~`|>[\]()]/g, '\\$&');
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
  return `Writing **${escapeMarkdown(p.writing)}** · ${p.done.length} files done`;
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
  // Before the rate limit, so a refusal for load does not use up the user's builds.
  if (
    activeBuilds >=
    MAX_CONCURRENT_BUILDS
  ) {
    await respondEphemeral(
      port,
      i,
      'RMH Vibes is busy. Try again in a minute.',
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
  activeBuilds++;
  try {
    await runBuild(
      port,
      i,
      req,
      deps,
      discordId,
    );
  } finally {
    activeBuilds--;
  }
}

async function runBuild(
  port: DiscordPort,
  i: Interaction,
  req: VibeRequest,
  deps: VibeDeps,
  discordId: string,
): Promise<void> {
  await deferReply(
    port,
    i,
  );

  const started =
    deps.now();
  const title = `Building: ${truncate(escapeMarkdown(req.prompt), PROMPT_TITLE_MAX)}`;
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
  // A bot that is stopping starts no builds, so a new one means the flag is stale (a restart in-process).
  draining = false;
  let settled = false;
  const live = {
    stop: async () => {
      if (settled) return;
      settled = true;
      await finish(
        errorBody(
          'The bot restarted before this finished. Try again.',
        ),
      );
    },
  };
  liveReplies.add(live);
  try {
    const userId =
      await deps.findLinkedUserId(
        discordId,
      );
    const verdict =
      (await deps.gate?.(
        userId,
      )) ?? 'ok';
    if (verdict !== 'ok') {
      await finish(
        errorBody(
          verdict === 'busy'
            ? 'RMH Vibes is busy right now. Try again later.'
            : 'You have used this month’s vibe allowance.',
        ),
      );
      return;
    }
    for await (const ev of deps.generate(
      {
        prompt:
          req.prompt,
        slug: req.slug,
        userId,
        kind: req.widget
          ? 'widget'
          : 'page',
        // The bot cannot show in-progress previews; building them is wasted work.
        previews: false,
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
        if (settled) return;
        settled = true;
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
        if (settled) return;
        settled = true;
        const done = await doneBody(
          deps,
          ev,
        );
        await finish(
          done.body,
        );
        if (
          !done.hasImage &&
          deps.sleep &&
          deps.thumbnailUrl
        )
          void addThumbnailLater(
            port,
            i,
            deps,
            ev,
            tokenAlive,
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
    if (!settled) {
      settled = true;
      await finish(
        errorBody(
          'The build ended early. Try again.',
        ),
      );
    }
  } catch (err) {
    // A thrown error can carry internals (SQL, paths): log it, say something fixed.
    console.error('discord_bot.vibe_failed', err);
    if (!settled) {
      settled = true;
      await finish(
        errorBody(
          'Could not build that vibe. Try again.',
        ),
      );
    }
  } finally {
    liveReplies.delete(live);
  }
}

/**
 * The done embed usually has no image: the screenshot is taken by a worker about a minute later.
 * Look twice more (bounded), and when it exists edit the message once to add it. Best effort and
 * never awaited by the build, so it holds neither a build slot nor the shutdown drain.
 */
async function addThumbnailLater(
  port: DiscordPort,
  i: Interaction,
  deps: VibeDeps,
  ev: {
    slug: string;
    title: string;
    description: string;
  },
  tokenAlive: () => boolean,
): Promise<void> {
  for (const delay of THUMB_FOLLOWUP_DELAYS_MS) {
    await deps.sleep?.(
      delay,
    );
    if (
      draining ||
      !tokenAlive()
    )
      return;
    try {
      const done = await doneBody(
        deps,
        ev,
      );
      if (
        !done.hasImage
      )
        continue;
      await port.editOriginal(
        i.token,
        done.body,
      );
      return;
    } catch {
      return;
    }
  }
}

async function doneBody(
  deps: VibeDeps,
  ev: {
    slug: string;
    title: string;
    description: string;
  },
): Promise<{
  body: MessageBody;
  hasImage: boolean;
}> {
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
  const body: MessageBody = {
    embeds:
      [
        {
          title:
            truncate(
              escapeMarkdown(
                ev.title ||
                  'Your vibe',
              ),
              256,
            ),
          description:
            truncate(
              escapeMarkdown(
                ev.description ||
                  '',
              ),
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
  return {
    body,
    hasImage: Boolean(thumb),
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
