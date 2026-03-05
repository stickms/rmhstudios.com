import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

/** Handle rules: 3-20 chars, lowercase alphanumeric + underscores, must start with a letter */
export const HANDLE_REGEX = /^[a-z][a-z0-9_]{2,19}$/;

/** Two weeks in milliseconds */
export const HANDLE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** Reserved handles that can't be claimed */
const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "auth",
  "login",
  "signup",
  "register",
  "settings",
  "profile",
  "post",
  "messages",
  "notifications",
  "search",
  "explore",
  "help",
  "about",
  "terms",
  "privacy",
  "support",
  "feedback",
  "rmh",
  "rmhstudios",
  "mod",
  "moderator",
  "system",
  "null",
  "undefined",
  "home",
  "feed",
  "builds",
  "games",
  "blog",
  "research",
  "news",
]);

export const handleSchema = z
  .string()
  .min(3, "Handle must be at least 3 characters")
  .max(20, "Handle must be at most 20 characters")
  .regex(
    HANDLE_REGEX,
    "Handle must start with a letter and contain only lowercase letters, numbers, and underscores"
  )
  .refine((h) => !RESERVED_HANDLES.has(h), "This handle is reserved");

/**
 * Generate a handle from a name/username string.
 * Sanitizes to valid handle characters, then appends a hex suffix if needed to avoid collisions.
 */
export async function generateHandle(source: string | null | undefined): Promise<string> {
  // Sanitize: lowercase, replace non-alphanumeric with underscore, collapse underscores
  let base = (source || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_/, "")
    .replace(/_$/, "");

  // Ensure it starts with a letter
  if (!base || !/^[a-z]/.test(base)) {
    base = "u" + base;
  }

  // Truncate to leave room for suffix
  base = base.slice(0, 16);

  // Try the base handle first
  if (base.length >= 3 && !RESERVED_HANDLES.has(base)) {
    const existing = await prisma.user.findUnique({ where: { handle: base }, select: { id: true } });
    if (!existing) return base;
  }

  // Add random hex suffix
  for (let i = 0; i < 10; i++) {
    const suffix = randomBytes(2).toString("hex"); // 4 hex chars
    const candidate = `${base}_${suffix}`.slice(0, 20);
    if (candidate.length >= 3 && !RESERVED_HANDLES.has(candidate)) {
      const existing = await prisma.user.findUnique({ where: { handle: candidate }, select: { id: true } });
      if (!existing) return candidate;
    }
  }

  // Fallback: use longer random suffix
  const fallback = `u${randomBytes(8).toString("hex")}`.slice(0, 20);
  return fallback;
}

/**
 * Check if a user can change their handle (2-week cooldown).
 * Admins bypass the cooldown.
 */
export function canChangeHandle(handleChangedAt: Date | null, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  if (!handleChangedAt) return true;
  return Date.now() - handleChangedAt.getTime() >= HANDLE_COOLDOWN_MS;
}

/**
 * Get remaining cooldown time in milliseconds. Returns 0 if no cooldown.
 */
export function handleCooldownRemaining(handleChangedAt: Date | null): number {
  if (!handleChangedAt) return 0;
  const elapsed = Date.now() - handleChangedAt.getTime();
  return Math.max(0, HANDLE_COOLDOWN_MS - elapsed);
}
