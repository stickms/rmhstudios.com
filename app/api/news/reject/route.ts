import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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

  const stagingPath = path.join(process.cwd(), "content/news/staging", `${slug}.mdx`);

  if (!fs.existsSync(stagingPath)) {
    return NextResponse.json(
      { error: "Article not found in staging. It may have already been published or expired." },
      { status: 404 }
    );
  }

  try {
    fs.unlinkSync(stagingPath);
    console.log(`[reject] Deleted staging file: ${slug}.mdx`);
  } catch (err) {
    console.error("[reject] Failed to delete staging file:", err);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }

  return new NextResponse(
    `Article "${slug}" rejected and deleted from staging.`,
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
}
