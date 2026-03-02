import type { Socket } from 'socket.io';
import { logger } from './logger';

interface AuthenticatedUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

const AUTH_URL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:7005';

export async function authenticateSocket(socket: Socket): Promise<AuthenticatedUser> {
  const token = socket.handshake.auth?.token;
  if (!token) throw new Error('No auth token provided');

  const res = await fetch(`${AUTH_URL}/api/auth/get-session`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error('Invalid session');

  const data = await res.json();
  const user = data?.user;
  if (!user?.id) throw new Error('Invalid user');

  logger.info('Socket authenticated', { userId: user.id, userName: user.name });

  return {
    userId: user.id,
    userName: user.name ?? 'Anonymous',
    avatarUrl: user.image ?? null,
  };
}
