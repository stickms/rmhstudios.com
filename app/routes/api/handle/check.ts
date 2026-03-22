import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { handleSchema } from "@/lib/handle";

export const Route = createFileRoute('/api/handle/check')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const handle = new URL(request.url).searchParams.get("handle");
    if (!handle) {
      return Response.json({ error: "Missing handle parameter" }, { status: 400 });
    }

    const validation = handleSchema.safeParse(handle);
    if (!validation.success) {
      return Response.json({
        available: false,
        reason: validation.error.issues[0]?.message ?? "Invalid handle",
      });
    }

    const existing = await prisma.user.findUnique({
      where: { handle },
      select: { id: true },
    });

    const available = !existing || existing.id === session.user.id;

    return Response.json({ available });
  } catch (error) {
    console.error("Handle check error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
