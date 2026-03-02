import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

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

  const cwd = process.cwd();
  const stagingPath = path.join(cwd, "content/news/staging", `${slug}.mdx`);
  const publishPath = path.join(cwd, "content/news", `${slug}.mdx`);

  if (!fs.existsSync(stagingPath)) {
    return NextResponse.json(
      { error: "Article not found in staging. It may have already been published or expired." },
      { status: 404 }
    );
  }

  try {
    fs.copyFileSync(stagingPath, publishPath);
    fs.unlinkSync(stagingPath);
  } catch (err) {
    console.error("[approve] Failed to move file from staging:", err);
    return NextResponse.json({ error: "Failed to move file" }, { status: 500 });
  }

  console.log(`[approve] Moved ${slug}.mdx from staging to content/news/`);

  // Commit the new article and trigger a redeploy in the background.
  // deploy.sh does git pull, so we must commit + push first.
  const gitCommands = [
    `git -C "${cwd}" add "content/news/${slug}.mdx"`,
    `git -C "${cwd}" commit -m "auto: publish ${slug} [skip ci]"`,
    `git -C "${cwd}" push origin main`,
  ].join(" && ");

  const deployScript = path.join(cwd, "deploy.sh");
  const deployCmd = fs.existsSync(deployScript)
    ? `nohup bash "${deployScript}" >> /var/log/news-deploy.log 2>&1 &`
    : "";

  const fullCmd = deployCmd ? `${gitCommands} && ${deployCmd}` : gitCommands;

  exec(fullCmd, { cwd }, (err) => {
    if (err) {
      console.error("[approve] Git/deploy command failed:", err.message);
    } else {
      console.log(`[approve] Git committed and deploy triggered for: ${slug}`);
    }
  });

  return new NextResponse(
    `Article "${slug}" approved. The site will rebuild and publish it shortly.`,
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
}
