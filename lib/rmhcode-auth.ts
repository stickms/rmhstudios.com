/**
 * Authentication helpers for rmhcode CLI token validation
 */

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';

/**
 * Hash a CLI token for at-rest storage / lookup. Tokens are stored only as their
 * SHA-256 digest (mirroring the developer API keys) so a read of the token table
 * (backup, replica, log leak, insider) can't yield live bearer credentials.
 * SHA-256 hex is 64 chars, the same width as the plaintext token, so no schema
 * change is required. Existing plaintext tokens stop validating and must be
 * re-issued.
 */
export function hashRmhCodeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Validate an rmhcode CLI token and return the user
 */
export async function validateRmhCodeToken(token: string) {
  const tokenRecord = await prisma.rmhCodeToken.findUnique({
    where: { token: hashRmhCodeToken(token) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          image: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    return null;
  }

  // Check if revoked
  if (tokenRecord.revokedAt) {
    return null;
  }

  // Check if expired
  if (tokenRecord.expiresAt < new Date()) {
    return null;
  }

  // Update last used timestamp
  await prisma.rmhCodeToken.update({
    where: { id: tokenRecord.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Non-critical, ignore errors
  });

  return tokenRecord.user;
}

/**
 * Get authenticated user from request
 * Supports both session auth and CLI token auth
 */
export async function getAuthenticatedUser(request: Request, sessionUserId?: string | null) {
  // First check for CLI token in header
  const cliToken = request.headers.get('X-RMHCode-Token');

  if (cliToken) {
    return validateRmhCodeToken(cliToken);
  }

  // Fall back to session user
  if (sessionUserId) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
      },
    });
    return user;
  }

  return null;
}
