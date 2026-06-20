import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma.server";
import { generateHandle } from "@/lib/handle";
import Stripe from "stripe";
import { stripe } from "@better-auth/stripe";

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
                defaultValue: false
            },
            isVerified: {
                type: "boolean",
                required: false,
                defaultValue: false
            }
        }
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    // Auto-assign a handle to new users if they don't have one
                    if (!user.handle) {
                        const handle = await generateHandle((user as any).username || user.name);
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
    ],
});
