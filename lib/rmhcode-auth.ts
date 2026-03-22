/**
 * Authentication helpers for rmhcode CLI token validation
 */

import { prisma } from '@/lib/prisma.server';

/**
 * Validate an rmhcode CLI token and return the user
 */
export async function validateRmhCodeToken(token: string) {
  const tokenRecord = await prisma.rmhCodeToken.findUnique({
    where: { token },
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
