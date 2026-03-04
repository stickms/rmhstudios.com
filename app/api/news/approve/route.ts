import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
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

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const token = req.nextUrl.searchParams.get("token");

  if (!slug || !token) {
    return NextResponse.json({ error: "Missing slug or token" }, { status: 400 });
  }

  if (!verifyToken(slug, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  const article = await prisma.newsArticle.findUnique({ where: { slug } });

  if (!article) {
    return NextResponse.json(
      { error: "Article not found. It may have already been published or rejected." },
      { status: 404 }
    );
  }

  if (article.status === "PUBLISHED") {
    return new NextResponse(
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

  return new NextResponse(
    `Article "${slug}" is now published and live on the site.`,
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
}
