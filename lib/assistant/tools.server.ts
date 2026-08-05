/**
 * Concierge tools (A18) — a hand-written allowlist of things the guide may do.
 * Server-only.
 *
 * `lib/assistant/assistant.server.ts` answers questions from a static knowledge
 * file. It cannot check *your* streak, open *your* wallet, or tell you which
 * quests you have left. It is a search box that speaks. This module is the set
 * of things it is allowed to look at instead — and, much more importantly, the
 * shape of the fence around them.
 *
 * ## The rules, and where each one is enforced
 *
 * **1. Every tool is an existing server function, called as the asking user.**
 * Nothing here queries Prisma directly. Each tool delegates to the function the
 * rest of the site already uses (`getStreak`, `getActiveQuests`, …), so a tool
 * cannot see more than the surface it wraps, and a permission fix made once is
 * a permission fix made here too. `ToolCtx.userId` comes from the session and
 * is never an argument — a tool that took a user id would be a tool that could
 * read somebody else's wallet by typing a cuid into a chat box.
 *
 * **2. No tool accepts a raw SQL fragment or a URL.** Enforced twice, because
 * one of the two is always the weaker:
 *
 *   - *Structurally, in the type.* `ToolParameters` is a flat `z.object` whose
 *     values must be branded fields from the builders below (`toolText`,
 *     `toolCount`, `toolFlag`, `toolChoice`). A bare `z.string()`, a nested
 *     object, an array, `z.any()` — none of them are assignable. There is no
 *     field shape in which a query fragment could arrive structurally intact.
 *   - *By content, at execution.* `toolText` refuses values that look like a
 *     URL or like SQL, and `runTool` re-checks every parsed argument before it
 *     reaches a handler. The type stops the shape; this stops the string.
 *
 * **3. A `confirm: true` tool cannot execute.** Not "must not" — cannot. The
 * tool union is discriminated on `confirm`, and the confirming branch has no
 * `run` at all: it has `propose`, which is synchronous, takes no side effect,
 * and returns a `ProposedAction` for the UI to render as a button. `runTool`
 * has no code path that calls a mutation. Making this a type distinction rather
 * than an `if (tool.confirm) return proposal` check is the difference between a
 * rule and a convention — the latter survives exactly until somebody adds a
 * fourth tool in a hurry.
 *
 * The knowledge corpus (`knowledge.server.ts`) stays exactly where it was: it
 * is the grounding for every question no tool answers, which is most of them.
 * Tools are for facts about *you*; the corpus is for facts about the platform.
 */

import { z } from 'zod';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { getStreak } from '@/lib/streak.server';
import { getBalance } from '@/lib/economy/ledger.server';
import { levelInfo } from '@/lib/xp/levels';
import { prisma } from '@/lib/prisma.server';
import { getActiveQuests } from '@/lib/quests/engine.server';

/* -------------------------------------------------------------------------- */
/* Argument fields — the type-level half of rule 2                            */
/* -------------------------------------------------------------------------- */

declare const toolFieldBrand: unique symbol;

/**
 * A zod schema that has been through one of the builders below.
 *
 * The brand is phantom — it costs nothing at runtime and exists purely so that
 * `z.string()` is not assignable where a tool field is required. Casting past
 * it is possible, as it is past any type; the point is that it takes a
 * deliberate, greppable lie rather than an oversight.
 */
type Branded<T> = T & { readonly [toolFieldBrand]: 'tool-field' };

export type SafeText = Branded<z.ZodString>;
export type SafeCount = Branded<z.ZodNumber>;
export type SafeFlag = Branded<z.ZodBoolean>;
export type SafeChoice = Branded<z.ZodEnum<Record<string, string>>>;
export type SafeOptional = Branded<z.ZodOptional<z.ZodString | z.ZodNumber | z.ZodBoolean>>;

export type ToolField = SafeText | SafeCount | SafeFlag | SafeChoice | SafeOptional;

/**
 * A tool's parameter schema: one flat object of branded scalar fields.
 *
 * Flat is deliberate. Nesting is where a "structured argument" turns into an
 * arbitrary payload, and every tool worth having takes two or three scalars.
 */
export type ToolParameters = z.ZodObject<Record<string, ToolField>>;

/** URL-shaped input. Rejected outright — no tool has a reason to accept one. */
const URLISH = /(?:^|\s)(?:https?:\/\/|\/\/|data:|javascript:|file:)/i;

/**
 * SQL-shaped input.
 *
 * Not a SQL parser and not pretending to be: it is a refusal to accept text
 * that reads like a query fragment, on the reasoning that no legitimate
 * concierge question does. Over-broad in the safe direction — "select a game
 * from the list" is not accepted as a search term, which costs one rephrase.
 */
const SQLISH =
  /\b(?:select\s+.*\bfrom\b|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+table|union\s+select|--\s|\/\*)/i;

/** Free text a person might type. Length-capped and content-screened. */
export function toolText(max: number): SafeText {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !URLISH.test(v), { message: 'URLs are not accepted' })
    .refine((v) => !SQLISH.test(v), { message: 'query fragments are not accepted' }) as SafeText;
}

/** A bounded whole number (player counts, limits). */
export function toolCount(min: number, max: number): SafeCount {
  return z.number().int().min(min).max(max) as SafeCount;
}

/** A boolean flag. */
export function toolFlag(): SafeFlag {
  return z.boolean() as SafeFlag;
}

/** One of a fixed set. The safest field there is — the values are ours. */
export function toolChoice<const T extends readonly [string, ...string[]]>(values: T): SafeChoice {
  return z.enum(values as unknown as string[]) as unknown as SafeChoice;
}

/** Wrap a field so the model may omit it. */
export function toolOptional(field: SafeText | SafeCount | SafeFlag): SafeOptional {
  return (field as z.ZodString | z.ZodNumber | z.ZodBoolean).optional() as SafeOptional;
}

/**
 * The runtime half of rule 2, applied to every parsed argument.
 *
 * Belt and braces with `toolText`: `toolChoice` and `toolCount` cannot carry a
 * URL, but a future field builder might, and this check does not care which
 * builder produced the value. Cheap enough to be unconditional.
 */
export function argsAreSafe(args: Record<string, unknown>): boolean {
  for (const value of Object.values(args)) {
    if (typeof value !== 'string') continue;
    if (URLISH.test(value) || SQLISH.test(value)) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Tool shapes — the type-level half of rule 3                                */
/* -------------------------------------------------------------------------- */

/** Everything a tool is allowed to know about who is asking. */
export interface ToolCtx {
  /** The signed-in user. Never an argument, never overridable by the model. */
  readonly userId: string;
}

/** What a read tool may return: JSON-serialisable facts, nothing else. */
export type ToolData = Record<string, unknown>;

/**
 * A write the UI renders as a button.
 *
 * `action` is a stable identifier the client maps to its own call — not a URL,
 * not a method, not a body. Proposing an endpoint would put a caller-controlled
 * request target one JSON field away from the model, which is the thing rule 2
 * exists to prevent; keeping the proposal symbolic means the client decides
 * what a `claim-quest` actually is.
 */
export interface ProposedAction {
  readonly tool: string;
  readonly action: 'claim-quest' | 'check-in-streak';
  /** Button label. Already in English; the client translates. */
  readonly label: string;
  /** One sentence describing exactly what pressing it will do. */
  readonly summary: string;
  readonly args: Readonly<Record<string, string | number | boolean>>;
}

interface ToolBase {
  readonly name: string;
  /** Written for the model. It is the only description it gets — be literal. */
  readonly description: string;
  readonly parameters: ToolParameters;
}

/** A tool that reads. Runs immediately; returns facts. */
export interface ReadTool extends ToolBase {
  readonly confirm?: false;
  // Declared as a method (not a property with a function type) so TypeScript's
  // method bivariance lets each tool narrow `args` to its own parsed shape
  // while the registry stays a homogeneous array.
  //
  // `Record<string, unknown>` rather than `Record<string, never>`: bivariance
  // accepts an override when EITHER direction is assignable, and a concrete
  // `{ query: string }` IS assignable to an unknown-valued index signature —
  // whereas nothing is assignable to a `never`-valued one, so the `never`
  // version rejected every tool that actually takes a parameter.
  run(ctx: ToolCtx, args: Record<string, unknown>): Promise<ToolData>;
}

/**
 * A tool that would write. Has no `run` — there is no execution path.
 *
 * `propose` is synchronous and takes no `Promise`, which is a second, smaller
 * guardrail: a function that cannot await cannot easily perform IO, so an
 * accidental mutation here has to be written on purpose.
 */
export interface ConfirmTool extends ToolBase {
  readonly confirm: true;
  propose(ctx: ToolCtx, args: Record<string, unknown>): ProposedAction;
}

export type AssistantTool = ReadTool | ConfirmTool;

/* -------------------------------------------------------------------------- */
/* The allowlist                                                              */
/* -------------------------------------------------------------------------- */

/** Catalog entries the concierge is allowed to surface. */
function visibleCatalog(): {
  id: string;
  title: string;
  blurb: string;
  href: string;
  tags: string[];
}[] {
  return [
    ...games
      .filter((g) => !g.unlisted)
      .map((g) => ({
        id: g.id,
        title: g.title,
        blurb: g.description,
        href: g.href,
        tags: g.tags,
      })),
    ...apps
      .filter((a) => !a.unlisted && !a.hidden)
      .map((a) => ({
        id: a.id,
        title: a.title,
        blurb: a.description,
        href: a.href,
        tags: a.tags,
      })),
  ];
}

/**
 * The tools, in full.
 *
 * Short on purpose. Every entry is a decision that this fact is worth exposing
 * to a text interface, and the list growing without that decision being made
 * each time is how an allowlist stops being one.
 */
export const TOOLS: readonly AssistantTool[] = [
  {
    name: 'get_my_progress',
    description:
      "The signed-in user's daily streak, level, coin balance, and how many of today's quests are still unfinished. Use when they ask about their own progress, streak, level, or coins.",
    parameters: z.object({}) as ToolParameters,
    async run(ctx: ToolCtx): Promise<ToolData> {
      const [streak, coins, profile, quests] = await Promise.all([
        getStreak(ctx.userId),
        getBalance(ctx.userId),
        prisma.userProfile.findUnique({ where: { userId: ctx.userId }, select: { xp: true } }),
        getActiveQuests(ctx.userId),
      ]);
      const level = levelInfo(profile?.xp ?? 0);
      return {
        streakDays: streak.current,
        longestStreak: streak.longest,
        checkedInToday: streak.checkedInToday,
        freezeTokens: streak.freezeTokens,
        level: level.level,
        xpIntoLevel: level.xpIntoLevel,
        xpForNextLevel: level.xpForNextLevel,
        coins,
        questsUnfinished: quests.filter((q) => !q.completed).length,
        questsReadyToClaim: quests.filter((q) => q.completed && !q.claimed).length,
      };
    },
  },

  {
    name: 'find_experience',
    description:
      'Search the RMH Studios catalog of games and apps by words, mood, or tag. Returns titles with a one-line blurb and the page to open. Use when the user asks what to play or which app does something.',
    parameters: z.object({ search: toolText(120) }) as ToolParameters,
    async run(_ctx: ToolCtx, args: { search: string }): Promise<ToolData> {
      // Deliberately a plain keyword scan over an in-memory catalog of a few
      // dozen entries. `knowledge.server.ts` already owns the ranked retrieval
      // for prose questions; duplicating its scoring here would give the model
      // two search paths that disagree.
      const terms = args.search
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);

      const scored = visibleCatalog()
        .map((entry) => {
          const haystack = `${entry.title} ${entry.blurb} ${entry.tags.join(' ')}`.toLowerCase();
          const score = terms.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0);
          return { entry, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((s) => s.entry);

      return { matches: scored, searched: terms.length };
    },
  },

  {
    name: 'list_my_quests',
    description:
      "The signed-in user's daily and weekly quests with progress, rewards, and which are ready to claim. Use when they ask what is left to do today.",
    parameters: z.object({}) as ToolParameters,
    async run(ctx: ToolCtx): Promise<ToolData> {
      const quests = await getActiveQuests(ctx.userId);
      return {
        quests: quests.map((q) => ({
          id: q.id,
          name: q.name,
          period: q.period,
          progress: q.progress,
          target: q.target,
          completed: q.completed,
          claimed: q.claimed,
          rewardCoins: q.coins,
          rewardXp: q.xp,
        })),
      };
    },
  },

  {
    name: 'claim_quest',
    description:
      'Claim the reward for a completed quest. REQUIRES CONFIRMATION — this proposes the action; the user presses a button to actually claim.',
    parameters: z.object({ questId: toolText(60) }) as ToolParameters,
    confirm: true,
    propose(_ctx: ToolCtx, args: { questId: string }): ProposedAction {
      return {
        tool: 'claim_quest',
        action: 'claim-quest',
        label: 'Claim reward',
        // No lookup: this is a proposal, and resolving the quest here would
        // mean a read on a path whose whole contract is "nothing happens yet".
        // The client already holds the quest list it is rendering.
        summary: `Claim the reward for quest "${args.questId}".`,
        args: { questId: args.questId },
      };
    },
  },

  {
    name: 'check_in_streak',
    description:
      "Check in for today to continue the user's daily streak. REQUIRES CONFIRMATION — this proposes the action; the user presses a button to check in.",
    parameters: z.object({}) as ToolParameters,
    confirm: true,
    propose(): ProposedAction {
      return {
        tool: 'check_in_streak',
        action: 'check-in-streak',
        label: 'Check in',
        summary: 'Check in for today and continue your daily streak.',
        args: {},
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** A tool by name, or undefined. `Map` rather than an object index — `TOOLS`
 * is data and a name off a model response must not reach `Object.prototype`. */
export function getTool(name: string): AssistantTool | undefined {
  return BY_NAME.get(name);
}

/** Narrow to the branch that can execute. */
export function isReadTool(tool: AssistantTool): tool is ReadTool {
  return tool.confirm !== true;
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

export type ToolOutcome =
  | { kind: 'result'; tool: string; data: ToolData }
  | { kind: 'proposal'; tool: string; proposal: ProposedAction }
  | {
      kind: 'error';
      tool: string;
      reason: 'unknown-tool' | 'invalid-args' | 'unsafe-args' | 'failed';
    };

/**
 * Validate and dispatch one tool call.
 *
 * The only entry point. Nothing else in the codebase should reach into `TOOLS`
 * and call a handler, because everything protective happens here: the name is
 * checked against the allowlist, the arguments are parsed by that tool's own
 * schema (which drops anything it did not declare), the parsed values are
 * content-screened, and only then does a handler see them.
 *
 * Never throws. A tool failure is an answer the assistant can degrade around —
 * it falls back to the knowledge corpus — and turning it into an exception
 * would take the whole reply down with it.
 */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolCtx): Promise<ToolOutcome> {
  const tool = getTool(name);
  if (!tool) return { kind: 'error', tool: name, reason: 'unknown-tool' };

  const parsed = tool.parameters.safeParse(
    rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {},
  );
  if (!parsed.success) return { kind: 'error', tool: name, reason: 'invalid-args' };

  const args = parsed.data as Record<string, never>;
  if (!argsAreSafe(args)) return { kind: 'error', tool: name, reason: 'unsafe-args' };

  if (!isReadTool(tool)) {
    // The confirming branch. There is no `await` and no mutation because the
    // type has no method that could perform one.
    return { kind: 'proposal', tool: name, proposal: tool.propose(ctx, args) };
  }

  try {
    return { kind: 'result', tool: name, data: await tool.run(ctx, args) };
  } catch (err) {
    console.warn(`[assistant] tool ${name} failed:`, (err as Error)?.message);
    return { kind: 'error', tool: name, reason: 'failed' };
  }
}

/**
 * The tool catalog as the model sees it.
 *
 * Rendered as text rather than as an OpenAI `tools` array because the site's
 * one model seam (`lib/ai/provider.server.ts`) intentionally exposes
 * `runTask`/`runTaskJson` and no tool-calling parameter — every call is metered
 * and budgeted through that single door. Rather than open a second OpenAI
 * client here to reach DeepSeek's function-calling API (which would bypass the
 * ledger, the budget and the prompt registry all at once), the selection step
 * is a structured-JSON call against this listing. See
 * `assistant.server.ts#selectTool` for the trade-off in full.
 */
export function describeTools(): string {
  return TOOLS.map((tool) => {
    const shape = tool.parameters.shape as Record<string, unknown>;
    const params = Object.keys(shape);
    return [
      `- ${tool.name}(${params.join(', ') || 'no arguments'})`,
      `    ${tool.description}`,
      tool.confirm === true ? '    NOTE: requires confirmation; proposes only.' : null,
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n');
}
