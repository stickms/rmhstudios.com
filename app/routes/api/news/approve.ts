import { createFileRoute } from '@tanstack/react-router';
import crypto from "crypto";
import { prisma } from "@/lib/prisma.server";
import { updateDiscordMessage } from "@/scripts/news-pipeline/discord";

function verifyToken(slug: string, token: string): boolean {
  const secret = process.env.NEWS_APPROVAL_SECRET ?? "";
  const expected = crypto.createHmac("sha256", secret).update(slug).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export const Route = createFileRoute('/api/news/approve')({
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

  if (article.status === "PUBLISHED") {
    return new Response(
      `Article "${slug}" is already published.`,
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  }

  await prisma.newsArticle.update({
    where: { slug },
    data: { status: "PUBLISHED" },
  });

  console.log(`[approve] Published article: ${slug}`);

  if (article.discordMessageId) {
    await updateDiscordMessage({
      messageId: article.discordMessageId,
      title: article.title,
      category: article.category,
      slug: article.slug,
      action: "approved",
    });
  }

  return new Response(
    `Article "${slug}" is now published and live on the site.`,
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
},
    },
  },
});
