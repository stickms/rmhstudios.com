import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { feedbackSchema } from "@/lib/feedback-schema";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const RECIPIENT = "hello@rmhstudios.com";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 3,
      windowMs: 10 * 60_000,
      prefix: "feedback",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = await req.json();
    const result = feedbackSchema.safeParse(body);

    if (!result.success) {
      const firstError = result.error.issues[0]?.message ?? "Invalid input";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { name, email, category, message, honeypot } = result.data;

    if (honeypot) {
      return NextResponse.json({ success: true });
    }

    if (!resend) {
      console.error("RESEND_API_KEY is not configured — feedback email not sent");
      return NextResponse.json(
        { error: "Feedback service is temporarily unavailable." },
        { status: 503 }
      );
    }

    const displayName = name?.trim() || "Anonymous";
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

    await resend.emails.send({
      from: "RMH Studios Feedback <noreply@rmhstudios.com>",
      to: RECIPIENT,
      replyTo: email,
      subject: `[Feedback - ${categoryLabel}] from ${displayName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9b7ad8; margin-bottom: 24px;">New Feedback Received</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 12px; font-weight: 600; color: #666; vertical-align: top;">Name</td>
              <td style="padding: 8px 12px;">${escapeHtml(displayName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: 600; color: #666; vertical-align: top;">Email</td>
              <td style="padding: 8px 12px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: 600; color: #666; vertical-align: top;">Category</td>
              <td style="padding: 8px 12px;">${escapeHtml(categoryLabel)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; font-weight: 600; color: #666; vertical-align: top;">Message</td>
              <td style="padding: 8px 12px; white-space: pre-wrap;">${escapeHtml(message)}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Sent from the RMH Studios feedback form &middot; IP: ${ip}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback submission error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
