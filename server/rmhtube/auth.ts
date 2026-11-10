/**
 * RmhTube WebSocket Authentication Middleware (hard auth)
 *
 * The session check itself is shared (server/shared/session-auth.ts); this file
 * only maps its outcome to rmhtube's errors and attaches userId, userName and
 * avatarUrl to socket.data for downstream handlers.
 */

import { config } from './config';
import { createSessionAuth } from '../shared/session-auth';
import type { Socket } from 'socket.io';
import type { ExtendedError } from 'socket.io';

const sessionAuth = createSessionAuth({
  service: 'rmhtube',
  databaseUrl: config.DATABASE_URL,
  defaultName: 'Viewer',
});

export async function authMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  try {
    const result = await sessionAuth.resolveSocketSession(socket.handshake);
    if (result.status === 'no_token') return next(new Error('AUTH_REQUIRED'));
    if (result.status === 'expired') return next(new Error('SESSION_EXPIRED'));
    if (result.status !== 'ok') return next(new Error('AUTH_FAILED'));

    socket.data.userId = result.session.userId;
    socket.data.userName = result.session.name;
    socket.data.avatarUrl = result.session.image;
    socket.data.sessionToken = result.session.token;
    next();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        service: 'rmhtube',
        timestamp: new Date().toISOString(),
        event: 'auth_validation_error',
        error: String(err),
      }),
    );
    next(new Error('AUTH_FAILED'));
  }
}

// ─── Cleanup ────────────────────────────────────────────────────

export async function closePool(): Promise<void> {
  await sessionAuth.close();
}
