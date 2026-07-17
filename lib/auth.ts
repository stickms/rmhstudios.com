// NOTE: the reflect-metadata polyfill that the passkey plugin (via tsyringe)
// needs is installed at server startup by the Nitro plugin in
// server/nitro/reflect-metadata.ts — a source-level import here is tree-shaken
// and reordered after the passkey chunk, so it must live in the startup plugin.
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma.server";
import { generateHandle } from "@/lib/handle";
import Stripe from "stripe";
import { stripe } from "@better-auth/stripe";
import { customSession } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { getUserTier } from "@/lib/entitlements";

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL,
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    trustedOrigins: [
        "https://rmhstudios.com",
        "https://www.rmhstudios.com",
        "https://staging.rmhstudios.com",
    ],
    advanced: {
        useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https"),
    },
    session: {
        // Signed session snapshot cached in the cookie so the common case
        // (validate the current session) does NOT hit the session/user table on
        // every request — the single biggest per-request DB read at scale.
        // TTL is deliberately short (60s) so a ban/sign-out still propagates
        // within a minute; longer would trade revocation latency for fewer reads.
        cookieCache: {
            enabled: true,
            maxAge: 60, // seconds
        },
    },
    // Throttle auth endpoints to blunt credential stuffing / account enumeration.
    // Defaults cover all auth routes; the stricter custom rules target the
    // sign-in/sign-up/forgot-password paths. Storage is in-memory per process;
    // set BETTER_AUTH_RATE_LIMIT_DB=1 to coordinate across processes via the DB.
    rateLimit: {
        enabled: true,
        window: 60, // seconds
        max: 200, // default per-window cap across auth routes
        storage: process.env.BETTER_AUTH_RATE_LIMIT_DB === "1" ? "database" : "memory",
        // Kept tighter than the rest (these guard against credential brute-force),
        // but loosened enough that legitimate retries/typos aren't blocked.
        customRules: {
            "/sign-in/email": { window: 60, max: 10 },
            "/sign-up/email": { window: 60, max: 10 },
            "/forget-password": { window: 60, max: 6 },
            "/reset-password": { window: 60, max: 10 },
        },
    },
    socialProviders: {
        discord: {
            clientId: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
            overrideUserInfoOnSignIn: true,
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            overrideUserInfoOnSignIn: true,
        },
        github: {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            overrideUserInfoOnSignIn: true,
        },
    },
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            username: {
                type: "string",
                required: false,
                input: true
            },
            handle: {
                type: "string",
                required: false,
            },
            isAdmin: {
                type: "boolean",
                required: false,
                defaultValue: false,
                input: false
            },
            isVerified: {
                type: "boolean",
                required: false,
                defaultValue: false,
                input: false
            }
        }
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Auto-assign a handle to new users if they don't have one
                    if (!user.handle) {
                        const handle = await generateHandle((user as { username?: string }).username || user.name);
                        await prisma.user.update({
                            where: { id: user.id },
                            data: { handle },
                        });
                    }
                },
            },
        },
    },
    plugins: [
        // WebAuthn/passkey sign-in. rpID/origin default from baseURL; override
        // via env when serving from multiple hostnames (e.g. www + apex).
        passkey({
            rpName: "RMH Studios",
            ...(process.env.PASSKEY_RP_ID ? { rpID: process.env.PASSKEY_RP_ID } : {}),
            ...(process.env.PASSKEY_ORIGIN ? { origin: process.env.PASSKEY_ORIGIN.split(",") } : {}),
        }),
        stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: true,
            subscription: {
                enabled: true,
                plans: [
                    {
                        name: "starter",
                        priceId: process.env.STRIPE_STARTER_PRICE_ID!,
                    },
                    {
                        name: "pro",
                        priceId: process.env.STRIPE_PRO_PRICE_ID!,
                    },
                ],
                // A user may only manage a subscription whose reference is their own id.
                authorizeReference: async ({ user, referenceId }) => {
                    return referenceId === user.id;
                },
            },
        }),
        customSession(async ({ user, session }) => {
            const tier = await getUserTier(user.id);
            return { user: { ...user, tier }, session };
        }),
    ],
});
