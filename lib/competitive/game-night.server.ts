import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/catalog';
import { GAME_NIGHT_KIND, gameNightDef, gameNightMeta } from '@/lib/calendar/event-model';
import { rotation } from './game-night';

export const GAME_IDS: ReadonlySet<string> = new Set(games.map((g) => g.id));

/**
 * A game night is a PLATFORM Event of kind 'game-night' repeating weekly in
 * UTC; its rotation (games, minutes per game, the live lobby codes) is the
 * event's `meta`. A disabled night is a DRAFT.
 */
export const gameNightWhere = { owner: 'PLATFORM', kind: GAME_NIGHT_KIND } as const;

export async function listGameNights() {
  const rows = await prisma.event.findMany({
    where: { ...gameNightWhere, visibility: 'PUBLIC', canceledAt: null },
    orderBy: { createdAt: 'asc' },
    take: 20,
    select: { id: true, title: true, startsAt: true, endsAt: true, meta: true },
  });
  const now = new Date();
  return rows.map((r) => {
    const def = gameNightDef(r);
    const rot = rotation(def, now);
    const codes = gameNightMeta(r.meta).lobbyCodes;
    const dto = (gameId: string) => {
      const g = games.find((x) => x.id === gameId);
      return { gameId, title: g?.title ?? gameId, href: g?.href ?? '/games' };
    };
    return {
      id: r.id,
      title: r.title,
      weekday: def.weekday,
      startMinute: def.startMinute,
      durationMinutes: def.durationMinutes,
      minutesPerGame: def.minutesPerGame,
      gameIds: def.games,
      state: rot.state,
      startsAt: rot.startsAt.toISOString(),
      endsAt: rot.endsAt.toISOString(),
      nowPlaying: rot.nowPlaying
        ? {
            ...dto(rot.nowPlaying.gameId),
            endsAt: rot.nowPlaying.endsAt.toISOString(),
            lobbyCode: codes[rot.nowPlaying.gameId] ?? null,
          }
        : null,
      upNext: rot.upNext
        ? { ...dto(rot.upNext.gameId), startsAt: rot.upNext.startsAt.toISOString() }
        : null,
    };
  });
}
