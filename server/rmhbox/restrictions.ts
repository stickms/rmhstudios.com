/**
 * s14-17: the RMHBox hub's view of a moderator's timeout on messages and chats, for the places that cannot await in
 * a socket handler (a minigame's synchronous input). `peekMessageRestriction` answers from what this process read in
 * the last 30 seconds; `loadMessageRestriction` reads (and fills that cache) and lets the member through when the
 * read fails, as the lobby chat does.
 */
import { peekRestrictedIn } from '../../lib/moderation/restrictions-core';
import { isMemberRestricted } from '../shared/member-restrictions';
import { getPrismaClient } from './prisma-client';
import { logger } from './logger';

export function peekMessageRestriction(userId: string): boolean | undefined {
  return peekRestrictedIn(userId, 'message');
}

export function loadMessageRestriction(userId: string): Promise<boolean> {
  return isMemberRestricted(getPrismaClient(), userId, 'message', (err) =>
    logger.error({ event: 'restriction_check_failed', userId, error: String(err) }),
  );
}
