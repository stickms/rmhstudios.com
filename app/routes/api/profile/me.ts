import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveUserDisplay } from "@/lib/user-display";

export const Route = createFileRoute('/api/profile/me')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        image: true,
        handle: true,
        profile: {
          select: {
            displayName: true,
            customImage: true,
          },
        },
      },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const resolved = resolveUserDisplay(user);
    return Response.json({
      name: resolved.name,
      image: resolved.image || "/images/social/default_avatar.png",
      handle: user.handle,
    });
  } catch (error) {
    console.error("Profile me error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
