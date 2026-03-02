import crypto from "crypto";

export function generateToken(slug: string): string {
  const secret = process.env.NEWS_APPROVAL_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(slug).digest("hex");
}

function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "http://localhost:7005").replace(/\/$/, "");
}

export async function postToDiscord(opts: {
  slug: string;
  title: string;
  description: string;
  category: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher: string;
}): Promise<void> {
  const webhookUrl = process.env.NEWS_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[discord] NEWS_DISCORD_WEBHOOK_URL not set — skipping Discord notification");
    return;
  }

  const token = generateToken(opts.slug);
  const siteUrl = getSiteUrl();
  const approveUrl = `${siteUrl}/api/news/approve?slug=${encodeURIComponent(opts.slug)}&token=${token}`;
  const rejectUrl = `${siteUrl}/api/news/reject?slug=${encodeURIComponent(opts.slug)}&token=${token}`;

  const payload = {
    embeds: [
      {
        title: "New Article Ready for Review",
        color: 5793266,
        fields: [
          { name: "Title", value: opts.title, inline: false },
          { name: "Category", value: opts.category, inline: true },
          { name: "Source", value: `[${opts.publisher}](${opts.sourceUrl})`, inline: true },
          { name: "Preview", value: opts.description.slice(0, 300), inline: false },
          { name: "Original Headline", value: opts.sourceTitle.slice(0, 256), inline: false },
        ],
        description: `[Approve](${approveUrl})  |  [Reject](${rejectUrl})`,
        footer: { text: `slug: ${opts.slug}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[discord] Webhook POST failed:", res.status, await res.text());
    } else {
      console.log(`[discord] Notification sent for: ${opts.slug}`);
    }
  } catch (err) {
    console.error("[discord] Failed to reach webhook:", err);
  }
}
