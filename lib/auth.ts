import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma.server";
import { generateHandle } from "@/lib/handle";

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    trustedOrigins: [
        "https://rmhstudios.com",
        "https://www.rmhstudios.com",
        "https://staging.rmhstudios.com",
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
});
