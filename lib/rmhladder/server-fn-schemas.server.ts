/**
 * Input schemas for the RMHLadder page routes' server functions.
 *
 * ## Why these live in `lib/**.server.ts` and not next to their routes
 *
 * They used to be declared at the top level of `app/routes/_site/rmhladder/*.tsx`,
 * which is the natural place to put them and also the one place that costs the
 * whole site. TanStack Start aggregates **every route module's top-level code
 * into the shared entry chunk**, so a `import { z } from 'zod'` in any route file
 * puts zod (71 KB raw / 16.6 KB brotli) on the critical path of every page on the
 * site — including the ones that have nothing to do with RMHLadder. Confirmed by
 * walking the built graph: `index-*.js` statically imported `schemas-*.js`, and
 * the enum literals from `fetchJobsSchema` were sitting in the entry.
 *
 * The `.server.ts` suffix is what fixes it: `stubServerFiles()` in
 * `vite.config.ts` replaces this module with `undefined` exports in the **client**
 * bundle only, so nothing here reaches a browser and zod leaves the entry. The
 * server build gets the real thing, so validation is byte-for-byte what it was.
 *
 * ## Why that is safe, precisely
 *
 * A server function's validator runs **only on the server**. From
 * `@tanstack/start-client-core`'s `createServerFn.js`:
 *
 * ```js
 * if (validator && env === "server") ctx.data = await execValidator(validator, ctx.data);
 * ```
 *
 * So the client never calls it, and an `undefined` schema on the client is never
 * dereferenced — provided the call site keeps the **lambda** form:
 *
 * ```ts
 * .validator((input: unknown) => fetchJobsSchema.parse(input))   // ✅ closure, not evaluated
 * .validator(fetchJobsSchema.parse)                              // ❌ dereferences at module scope
 * ```
 *
 * The second form reads `.parse` off the schema *while the module is loading*,
 * which on the client is a `TypeError` on `undefined`. Every call site here uses
 * the first form; keep it that way, and keep any derived schema (an `.extend()`,
 * a `.pick()`) in **this** file rather than in the route, for the same reason.
 *
 * This is not a route-search concern: `validateSearch` DOES run on the client, so
 * a search schema can never live behind a `.server` boundary. The two routes that
 * needed one (`bums-rush`, `sohumbum2/$date`) hand-roll their parsing instead.
 */

import { z } from 'zod';

/* ── alerts ──────────────────────────────────────────────────────────────── */

export const markReadSchema = z.object({ alertId: z.string().min(1).max(200).optional() });

/* ── companies ───────────────────────────────────────────────────────────── */

export const fetchCompaniesSchema = z.object({
  q: z.string().max(200).optional(),
});

export const doCompanyActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('enabled'), companyId: z.string().min(1), enabled: z.boolean() }),
  z.object({
    kind: z.literal('priority'),
    companyId: z.string().min(1),
    priorityLevel: z.number().int().min(1).max(5),
  }),
  z.object({ kind: z.literal('watchlist'), companyId: z.string().min(1), on: z.boolean() }),
]);

/* ── jobs ────────────────────────────────────────────────────────────────── */

export const fetchJobsSchema = z.object({
  preset: z
    .enum(['new', 'finance', 'consulting', 'tech', 'expiring', 'remote', 'saved', 'ignored'])
    .optional(),
  q: z.string().max(200).optional(),
  cities: z.array(z.string()).max(50).optional(),
  programTypes: z.array(z.string()).max(50).optional(),
  sort: z.enum(['relevance', 'posted', 'deadline']).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
  take: z.number().int().min(1).max(100).optional(),
});

export const setJobActionSchema = z.object({
  jobId: z.string().min(1),
  action: z.enum(['saved', 'applied', 'ignored']).nullable(),
});

/* ── jobs/$jobId ─────────────────────────────────────────────────────────── */

export const jobIdSchema = z.object({ jobId: z.string().min(1).max(200) });

// Derived here rather than in the route: `.extend()` is evaluated at module
// scope, so on the client it would run against an `undefined` stub.
export const jobActionSchema = jobIdSchema.extend({
  action: z.enum(['saved', 'applied', 'ignored']).nullable(),
});

/* ── pipeline ────────────────────────────────────────────────────────────── */

export const doUpdateApplicationSchema = z.object({
  jobId: z.string().min(1),
  // Restrict to a plain object; the actions layer's `applicationPatchSchema`
  // parses the patch fields authoritatively.
  patch: z.object({}).passthrough(),
});

/* ── review ──────────────────────────────────────────────────────────────── */

export const fetchTasksSchema = z.object({
  tab: z.enum(['open', 'resolved']),
});

export const doResolveSchema = z.object({
  taskId: z.string().min(1),
  resolution: z.enum(['verify', 'expire', 'duplicate', 'non_us', 'ignore']),
});

/* ── settings ────────────────────────────────────────────────────────────── */

// `updatePrefs` parses authoritatively; passthrough here ensures any unknown keys
// from future fields reach the handler without breaking validation.
export const doUpdatePrefsSchema = z.object({}).passthrough();

export const doKeywordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('upsert'),
    keyword: z.string().min(1).max(100),
    type: z.enum(['boost', 'block']),
    weight: z.number().int().min(0).max(50),
  }),
  z.object({
    kind: z.literal('delete'),
    keyword: z.string().min(1),
    type: z.enum(['boost', 'block']),
  }),
  z.object({
    kind: z.literal('watchlist'),
    companyId: z.string().min(1).max(100),
    on: z.boolean(),
  }),
]);
