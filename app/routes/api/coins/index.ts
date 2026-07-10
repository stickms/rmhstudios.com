import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";

export const Route = createFileRoute('/api/coins/')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { coins: true },
    });

    return Response.json({
      coins: profile?.coins ?? 10,
    });
  } catch (error) {
    console.error("Coins fetch error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
