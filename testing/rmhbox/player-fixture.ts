import type { RMHboxPlayer } from '../../server/rmhbox/types';

export interface MockUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
  sessionToken: string;
  expiresAt: Date;
}

export function createPlayer(user: MockUser, overrides: Partial<RMHboxPlayer> = {}): RMHboxPlayer {
  return {
    userId: user.userId,
    userName: user.userName,
    avatarUrl: user.avatarUrl,
    socketId: `socket-${user.userId}`,
    isConnected: true,
    isReady: false,
    isAway: false,
    score: 0,
    roundScore: 0,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
    role: 'player',
    ...overrides,
  };
}
