/**
 * Migration script: assigns a unique handle to every user that doesn't have one.
 * Uses the user's username (if set) or name as the base, appending a hex suffix on collisions.
 *
 * Run with: npx tsx scripts/assign-handles.ts
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const HANDLE_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

const RESERVED_HANDLES = new Set([
  "admin", "api", "auth", "login", "signup", "register", "settings",
  "profile", "post", "messages", "notifications", "search", "explore",
  "help", "about", "terms", "privacy", "support", "feedback", "rmh",
  "rmhstudios", "mod", "moderator", "system", "null", "undefined",
  "home", "feed", "builds", "games", "blog", "research", "news",
]);

function sanitize(source: string): string {
  let base = source
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_/, "")
    .replace(/_$/, "");

  if (!base || !/^[a-z]/.test(base)) {
    base = "u" + base;
  }

  return base.slice(0, 16);
}

async function main() {
  const usersWithoutHandle = await prisma.user.findMany({
    where: { handle: null },
    select: { id: true, username: true, name: true },
  });

  console.log(`Found ${usersWithoutHandle.length} users without a handle.`);

  const takenHandles = new Set<string>();
  // Pre-load existing handles
  const existing = await prisma.user.findMany({
    where: { handle: { not: null } },
    select: { handle: true },
  });
  for (const u of existing) {
    if (u.handle) takenHandles.add(u.handle);
  }

  let assigned = 0;

  for (const user of usersWithoutHandle) {
    const base = sanitize(user.username || user.name || "user");

    let handle: string | null = null;

    // Try base handle
    if (base.length >= 3 && !RESERVED_HANDLES.has(base) && !takenHandles.has(base)) {
      handle = base;
    }

    // Try with suffix
    if (!handle) {
      for (let i = 0; i < 20; i++) {
        const suffix = randomBytes(2).toString("hex");
        const candidate = `${base}_${suffix}`.slice(0, 20);
        if (candidate.length >= 3 && !RESERVED_HANDLES.has(candidate) && !takenHandles.has(candidate)) {
          handle = candidate;
          break;
        }
      }
    }

    // Fallback
    if (!handle) {
      handle = `u${randomBytes(8).toString("hex")}`.slice(0, 20);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { handle },
    });

    takenHandles.add(handle);
    assigned++;

    if (assigned % 100 === 0) {
      console.log(`  Assigned ${assigned}/${usersWithoutHandle.length}...`);
    }
  }

  console.log(`Done! Assigned handles to ${assigned} users.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
