import { prisma } from '@/lib/prisma.server';
import { games } from '@/lib/games';
import { rotation, type GameNightDef } from './game-night';

export const GAME_IDS: ReadonlySet<string> = new Set(games.map((g) => g.id));

function toDef(r: {
  id: string;
  title: string;
  weekday: number;
  startMinute: number;
  durationMinutes: number;
  minutesPerGame: number;
  games: unknown;
}): GameNightDef {
  const list = Array.isArray(r.games)
    ? (r.games as unknown[]).filter((g): g is string => typeof g === 'string')
    : [];
  return { ...r, games: list };
}

export async function listGameNights() {
  const rows = await prisma.gameNight.findMany({
    where: { enabled: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
  const now = new Date();
  return rows.map((r) => {
    const def = toDef(r);
    const rot = rotation(def, now);
    const codes = (r.lobbyCodes ?? {}) as Record<string, string>;
    const dto = (gameId: string) => {
      const g = games.find((x) => x.id === gameId);
      return { gameId, title: g?.title ?? gameId, href: g?.href ?? '/games' };
    };
    return {
      id: r.id,
      title: r.title,
      weekday: r.weekday,
      startMinute: r.startMinute,
      durationMinutes: r.durationMinutes,
      minutesPerGame: r.minutesPerGame,
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
