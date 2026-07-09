import { createFileRoute } from '@tanstack/react-router';
import crypto from "crypto";
import { prisma } from "@/lib/prisma.server";

function verifyToken(slug: string, token: string): boolean {
  const secret = process.env.NEWS_APPROVAL_SECRET ?? "";
  // Fail closed: an unset secret would make the HMAC key the empty string, so
  // anyone who knows a slug could forge a valid token. Never validate then.
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(slug).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export const Route = createFileRoute('/api/news/reject')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const slug = new URL(request.url).searchParams.get("slug");
  const token = new URL(request.url).searchParams.get("token");

  if (!slug || !token) {
    return Response.json({ error: "Missing slug or token" }, { status: 400 });
  }

  if (!verifyToken(slug, token)) {
    return Response.json({ error: "Invalid token" }, { status: 403 });
  }

  const article = await prisma.newsArticle.findUnique({ where: { slug } });

  if (!article) {
    return Response.json(
      { error: "Article not found. It may have already been published or rejected." },
      { status: 404 }
    );
  }

  await prisma.newsArticle.delete({ where: { slug } });

  console.log(`[reject] Deleted article: ${slug}`);

  return new Response(
    `Article "${slug}" has been rejected and deleted.`,
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
},
    },
  },
});
