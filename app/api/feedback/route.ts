import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { feedbackSchema } from "@/lib/feedback-schema";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET() {
  try {
    const feedbacks = await prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { name: true, username: true, image: true },
        },
      },
    });

    const formatted = feedbacks.map((f: any) => ({
      id: f.id,
      category: f.category,
      message: f.message,
      createdAt: f.createdAt,
      user: {
        name: f.user.name || f.user.username || "Unknown",
        image: f.user.image,
      },
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("Fetch feedback error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const { category, message } = result.data;

    const feedback = await prisma.feedback.create({
      data: {
        category,
        message,
        userId: session.user.id,
      },
      include: {
        user: {
          select: { name: true, username: true, image: true },
        },
      },
    });

    return NextResponse.json({
      id: feedback.id,
      category: feedback.category,
      message: feedback.message,
      createdAt: feedback.createdAt,
      user: {
        name: feedback.user.name || feedback.user.username || "Unknown",
        image: feedback.user.image,
      },
    });
  } catch (error) {
    console.error("Post feedback error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
