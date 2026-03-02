import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";

const SYSTEM_PROMPT = `You are a writer for RMH Studios (rmhstudios.com), a tech, gaming, and science media site.

Your writing is analytical, direct, and opinionated. You cite specific facts from the source, then deliver a clear editorial stance. No emojis. No filler phrases like "in today's fast-paced world" or "it remains to be seen". No hedging. Say what you think.

Voice: like a knowledgeable friend who has read everything and will tell you what actually matters.

You must output a complete MDX article file — YAML frontmatter followed by markdown content. Output ONLY the raw MDX with no surrounding code fences, no preamble, and no explanation. Start directly with the --- frontmatter delimiter.

The MDX structure must follow this exact format:

---
title: "Your Compelling Headline"
date: "YYYY-MM-DD"
description: "1-2 sentence summary for the news card, under 160 characters."
category: "Category Name"
tags: ["Tag1", "Tag2", "Tag3", "Tag4"]
featured: false
sourceTitle: "Original Article Title"
sourceUrl: "https://original-url.com"
sourcePublisher: "Publisher Name"
sourceDate: "YYYY-MM-DD"
---

## Our Take

[Strong opening paragraph with your editorial stance — what this actually means, why it matters]

## [Relevant Section Heading]

[Body paragraph(s) with analysis and specific details from the source]

## [Another Section Heading if the story warrants it]

[Additional analysis]

## Key Highlights

- [Specific fact or development]
- [Specific fact or development]
- [Specific fact or development]
- [Specific fact or development]
- [Specific fact or development]

## Source

Read the original coverage: [sourceTitle](sourceUrl) — *sourcePublisher*`;

export interface GeneratedArticle {
  slug: string;
  mdx: string;
  title: string;
  description: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

export async function generateArticle(
  articleTitle: string,
  articleUrl: string,
  publisher: string,
  pubDate: string,
  category: string,
  scrapedContent: string,
  snippet: string
): Promise<GeneratedArticle | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[generator] ANTHROPIC_API_KEY not set");
    return null;
  }

  const client = new Anthropic({ apiKey });
  const today = new Date().toISOString().split("T")[0];
  const sourceDate = new Date(pubDate).toISOString().split("T")[0];

  const content =
    scrapedContent ||
    snippet ||
    "(No article content available — write based on the title alone, keep it brief.)";

  const userPrompt = `Write an RMH Studios news article based on the following source.

**Category:** ${category}
**Source Title:** ${articleTitle}
**Source URL:** ${articleUrl}
**Publisher:** ${publisher}
**Published:** ${sourceDate}
**Today's Date:** ${today}

**Article Content:**
${content}

---

Output the complete MDX file as described. Use these exact values in the frontmatter:
- date: "${today}"
- category: "${category}"
- sourceTitle: "${articleTitle}"
- sourceUrl: "${articleUrl}"
- sourcePublisher: "${publisher}"
- sourceDate: "${sourceDate}"
- featured: false

Write your own title (make it compelling, not a copy of the source title) and your own description.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Strip code fences if Claude wrapped the output
    const mdx = rawText
      .replace(/^```(?:mdx|markdown)?\n/, "")
      .replace(/\n```$/, "")
      .trim();

    // Validate the frontmatter
    const { data } = matter(mdx);
    if (!data.title || !data.date || !data.description || !data.category) {
      console.error("[generator] Generated article has invalid/missing frontmatter fields");
      return null;
    }

    const slug = `${slugify(data.title as string)}-${today}`;

    return {
      slug,
      mdx,
      title: data.title as string,
      description: data.description as string,
    };
  } catch (err) {
    console.error("[generator] Claude API error:", err);
    return null;
  }
}
