import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    trustedOrigins: [
        "https://rmhstudios.com",
        "https://www.rmhstudios.com",
    ],
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
    }
});
