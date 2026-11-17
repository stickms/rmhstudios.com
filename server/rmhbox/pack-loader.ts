/**
 * RMHbox — community prompt packs (R2). Loads a pack's prompts by share code for
 * a minigame about to start. Returns null for an unknown, hidden or wrong-game code.
 */
import { getPrismaClient } from './prisma-client';
import { logger } from './logger';

export async function loadPackPrompts(
  rawCode: string,
  game: string,
): Promise<
  | string[]
  | null
> {
  // Codes are issued in upper case; accept what a host types (case, stray spaces)
  const code =
    typeof rawCode ===
    'string'
      ? rawCode
          .trim()
          .toUpperCase()
      : '';
  if (
    !/^[A-Z0-9]{6}$/.test(
      code,
    )
  )
    return null;
  try {
    const row =
      await getPrismaClient().rmhboxPack.findFirst(
        {
          where:
            {
              code,
              game,
              hidden: false,
            },
          select:
            {
              prompts: true,
            },
        },
      );
    if (
      !row ||
      !Array.isArray(
        row.prompts,
      )
    )
      return null;
    return (
      row.prompts as unknown[]
    ).filter(
      (
        p,
      ): p is string =>
        typeof p ===
        'string',
    );
  } catch (err) {
    logger.error(
      {
        event:
          'pack_load_failed',
        code,
        error:
          String(
            err,
          ),
      },
    );
    return null;
  }
}
