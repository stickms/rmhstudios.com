import crypto from "crypto";
import { stripTrailingSlash } from "../../lib/url";

export function generateToken(slug: string): string {
  const secret = process.env.NEWS_APPROVAL_SECRET ?? "";
  return crypto.createHmac("sha256", secret).update(slug).digest("hex");
}

function getWebhookUrl(): string | null {
  return process.env.NEWS_DISCORD_WEBHOOK_URL ?? null;
}

function getSiteUrl(): string {
  return stripTrailingSlash(process.env.VITE_BETTER_AUTH_URL ?? "http://localhost:7005");
}

/** Discord embed color constants */
const COLOR_PENDING = 5793266; // blue-ish (original)
const COLOR_APPROVED = 5763719; // green  (#57F287)
const COLOR_REJECTED = 15548997; // red    (#ED4245)

export async function postToDiscord(opts: {
  slug: string;
  title: string;
  description: string;
  category: string;
  sourceTitle: string;
  sourceUrl: string;
  publisher: string;
}): Promise<string | null> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.warn("[discord] NEWS_DISCORD_WEBHOOK_URL not set — skipping Discord notification");
    return null;
  }

  const token = generateToken(opts.slug);
  const siteUrl = getSiteUrl();
  const approveUrl = `${siteUrl}/api/news/approve?slug=${encodeURIComponent(opts.slug)}&token=${token}`;
  const rejectUrl = `${siteUrl}/api/news/reject?slug=${encodeURIComponent(opts.slug)}&token=${token}`;

  const payload = {
    embeds: [
      {
        title: "New Article Ready for Review",
        color: COLOR_PENDING,
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
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[discord] Webhook POST failed:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    console.log(`[discord] Notification sent for: ${opts.slug} (messageId: ${data.id})`);
    return data.id as string;
  } catch (err) {
    console.error("[discord] Failed to reach webhook:", err);
    return null;
  }
}

export async function updateDiscordMessage(opts: {
  messageId: string;
  title: string;
  category: string;
  slug: string;
  action: "approved" | "rejected";
}): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const isApproved = opts.action === "approved";

  const payload = {
    embeds: [
      {
        title: isApproved ? "Article Approved" : "Article Rejected",
        color: isApproved ? COLOR_APPROVED : COLOR_REJECTED,
        fields: [
          { name: "Title", value: opts.title, inline: false },
          { name: "Category", value: opts.category, inline: true },
          {
            name: "Status",
            value: isApproved ? "Published and live on site" : "Rejected and deleted",
            inline: true,
          },
        ],
        footer: { text: `slug: ${opts.slug}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(`${webhookUrl}/messages/${opts.messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[discord] Message update failed:", res.status, await res.text());
    } else {
      console.log(`[discord] Message updated (${opts.action}): ${opts.slug}`);
    }
  } catch (err) {
    console.error("[discord] Failed to update message:", err);
  }
}
