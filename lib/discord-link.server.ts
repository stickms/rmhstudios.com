/**
 * Discord → site account link. A user who signed in to the site with Discord has a Better Auth
 * `account` row (providerId "discord", accountId = their Discord id); the bot uses it to act as
 * that user (e.g. so a vibe they build is theirs to edit).
 */
import { prisma } from './prisma.server';

/** The site user id linked to this Discord id, or null when they never signed in with Discord. */
export async function findLinkedUserId(
  discordId: string,
): Promise<
  | string
  | null
> {
  const row =
    await prisma.account.findFirst(
      {
        where:
          {
            providerId:
              'discord',
            accountId:
              discordId,
          },
        select:
          {
            userId: true,
          },
      },
    );
  return (
    row?.userId ??
    null
  );
}
