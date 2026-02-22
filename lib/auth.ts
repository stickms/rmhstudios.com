import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    socialProviders: {
        discord: {
            clientId: process.env.DISCORD_CLIENT_ID!,
            clientSecret: process.env.DISCORD_CLIENT_SECRET!,
        },
    },
    emailAndPassword: {
        enabled: !!process.env.ALLOW_EMAIL_ONLY_AUTH,
    },
    user: {
        additionalFields: {
            username: {
                type: "string",
                required: false, // Optional if we allow email-only login too, or true if mandatory
                input: true // Allow input in signUp
            }
        }
    }
});
