/** Client-safe shapes the playtime server module returns (see playtime.server.ts). */

export type PlaytimeActivity = {
  totalSeconds: number;
  last2WeeksSeconds: number;
  lastPlayedAt: string | null;
};

export type PlayerView = {
  userId: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  totalSeconds: number;
  last2WeeksSeconds: number;
};
