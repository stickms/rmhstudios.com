/** Contracts for Dream Rift's score submits (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

/** Personal high score; the server derives the display name from the account. */
export const submitDreamRiftScoreApi =
  endpoint<{
    body: {
      score: number;
      difficulty: string;
      stage: number;
      character: string;
      graze: number;
      spellsCaptured: number;
    };
    res: {
      success: true;
      linked?: true;
      created?: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/dream-rift/score',
    },
  );

/** The host files a co-op squad's record (2-4 players). */
export const submitDreamRiftCoopApi =
  endpoint<{
    body: {
      difficulty: string;
      combinedScore: number;
      timeSurvived: number;
      stageReached: number;
      cleared: boolean;
      players: {
        name: string;
        charId: string;
        score: number;
        userId?:
          | string
          | null
          | undefined;
      }[];
    };
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/dream-rift/coop',
    },
  );
