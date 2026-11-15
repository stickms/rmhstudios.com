/** Contracts for the coin bet / claim mutations (redesign audit C1, batch 10). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { betSchema } from '@/lib/coins-schema';

export const placePlinkoBetApi =
  endpoint<{
    body: z.infer<
      typeof betSchema
    >;
    res: {
      won: boolean;
      payout: number;
      newBalance: number;
      startX: number;
      landedBin: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/coins/bet',
    },
  );

export const claimCoinsApi =
  endpoint<{
    res: {
      newBalance: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/coins/claim',
    },
  );

export interface CasinoLobbyRoom {
  roomId: string;
  name: string;
  ownerName: string;
  playerCount: number;
  maxPlayers: number;
  inProgress: boolean;
  smallBlind?: number;
  bigBlind?: number;
}

/** Open casino tables per game, for the signed-out lobby preview. Empty lists whenever the hub is unreachable. */
export const getCasinoRoomsApi =
  endpoint<{
    res: Record<
      | 'blackjack'
      | 'holdem'
      | 'baccarat'
      | 'roulette',
      CasinoLobbyRoom[]
    >;
  }>()(
    {
      method:
        'GET',
      path: '/api/casino/rooms',
    },
  );
