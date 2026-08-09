import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getProfile, upsertProfile } from '@/lib/bums-rush/progress/save.server';
import type { Profile } from '@/lib/bums-rush/types';

/**
 * GET/PUT /api/bums-rush/profile — the whole profile (design doc §10.3).
 *
 * This is the endpoint `lib/bums-rush/progress/save.ts`'s custom
 * `CloudTransport` reads and writes: the body IS a `Profile`
 * (`lib/bums-rush/types.ts`), no `{ saveData }` wrapper — see that file's
 * module doc for why. GET never 404s for a brand-new account; it returns the
 * same default profile a fresh guest save would have, so the client does not
 * need a special case for "just signed up".
 */
const cosmeticsSchema = z
  .object({
    head: z.string().min(1).max(64),
    hat: z.string().min(1).max(64).nullable(),
    gloves: z.string().min(1).max(64),
    ink: z.string().min(1).max(64),
  })
  .strict();

const assistsSchema = z
  .object({
    grabAssist: z.boolean(),
    stickyGrip: z.boolean(),
    analogTriggers: z.boolean(),
    autoGrab: z.boolean(),
    slowMo: z.boolean(),
    extraCheckpoints: z.boolean(),
    noFallDamage: z.boolean(),
    aimSmoothing: z.number().min(0).max(1),
    oneHanded: z.boolean(),
  })
  .strict();

const settingsSchema = z
  .object({
    assists: assistsSchema,
    music: z.number().min(0).max(1),
    sfx: z.number().min(0).max(1),
    ui: z.number().min(0).max(1),
    rumble: z.number().min(0).max(1),
    alwaysShowTags: z.boolean(),
    catAfterWipes: z.union([z.literal(0), z.literal(3), z.literal(6)]),
    touchScheme: z.union([z.literal('auto-grab'), z.literal('two-stick')]),
    touchTilt: z.boolean(),
    deadzone: z.number().min(0).max(1),
    saturation: z.number().min(0).max(2),
    padBrand: z.union([
      z.literal('auto'),
      z.literal('xbox'),
      z.literal('playstation'),
      z.literal('nintendo'),
      z.literal('generic'),
    ]),
  })
  .strict();

const levelClearSchema = z
  .object({
    levelId: z.string().min(1).max(64),
    playerCount: z.number().int().min(1).max(4),
    bestMs: z
      .number()
      .finite()
      .min(0)
      .max(24 * 60 * 60 * 1000),
    // A raw bitmask over 3 objectives — 0..7. Anything outside that range is
    // rejected here rather than silently masked, since a client sending a
    // wider value is not a save format this route recognizes.
    objectives: z.number().int().min(0).max(0b111),
    assisted: z.boolean(),
    clears: z.number().int().min(1).max(1_000_000),
  })
  .strict();

/**
 * Mirrors `Profile` (§10.2). Array-length limits alone don't add up to a
 * tight bound — 72 levels × 4 player counts is 288 possible clear records
 * before even counting the cosmetic-id arrays — so the serialized size is
 * also checked directly against §10.3's 64 KB cap below.
 */
const PROFILE_BODY_MAX_BYTES = 64 * 1024;

const profileBodySchema = z
  .object({
    cosmetics: cosmeticsSchema,
    unlockedCosmetics: z.array(z.string().min(1).max(64)).max(200),
    parcelsFound: z.array(z.string().min(1).max(64)).max(200),
    posesFound: z.array(z.string().min(1).max(64)).max(200),
    recipesMade: z.array(z.string().min(1).max(64)).max(200),
    clears: z
      .record(z.string(), levelClearSchema)
      .refine((clears) => Object.keys(clears).length <= 400, {
        message: 'too many clear records',
      }),
    levelsCleared: z.number().int().min(0).max(72),
    deaths: z.number().int().min(0),
    metresSwung: z.number().int().min(0),
    showdownRating: z.number().int(),
    showdownWins: z.number().int().min(0),
    showdownLosses: z.number().int().min(0),
    settings: settingsSchema,
    updatedAt: z.number(),
  })
  .strict()
  .refine((value) => JSON.stringify(value).length <= PROFILE_BODY_MAX_BYTES, {
    message: 'profile payload exceeds the 64 KB cap',
  });

export const Route = createFileRoute('/api/bums-rush/profile')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ userId }) => Response.json(await getProfile(userId))),

      PUT: defineHandler(
        { rateLimit: 'write', body: profileBodySchema },
        async ({ userId, body }) => {
          const profile: Profile = body;
          const saved = await upsertProfile(userId, profile);
          return Response.json(saved);
        },
      ),
    },
  },
});
