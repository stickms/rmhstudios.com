/**
 * Contracts for the progress column: level/quests summary, the battle pass and their claims
 * (redesign audit C1, batch 3). Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type {
  PassReward,
  PassTier,
} from '@/lib/battlepass/season';

export interface QuestView {
  id: string;
  period:
    | 'daily'
    | 'weekly';
  name: string;
  description: string;
  target: number;
  xp: number;
  coins: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface LevelInfo {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
}

export interface ProgressPayload {
  level: LevelInfo;
  coins: number;
  quests: QuestView[];
  season: {
    id: string;
    name: string;
    endsAt: string;
    seasonXp: number;
    tier: number;
    maxTier: number;
    premium: boolean;
  };
}

export interface BattlePassPayload {
  season: {
    id: string;
    name: string;
    endsAt: string;
    premiumPrice: number;
    xpPerTier: number;
  };
  tiers: PassTier[];
  seasonXp: number;
  currentTier: number;
  premium: boolean;
  claimedFree: number[];
  claimedPaid: number[];
  signedIn: boolean;
}

/** The signed-in user's level, quests and season summary. */
export const getProgressApi =
  endpoint<{
    res: ProgressPayload;
  }>()(
    {
      method:
        'GET',
      path: '/api/progress',
    },
  );

/** The current season's tiers and the viewer's progress (signed-out viewers get zeroes). */
export const getBattlePassApi =
  endpoint<{
    res: BattlePassPayload;
  }>()(
    {
      method:
        'GET',
      path: '/api/battlepass',
    },
  );

/**
 * Claim a reached tier's reward. 404 `Unknown tier`; 400 `No reward on this track`; 403
 * `Tier not yet reached` / `Premium track locked`; 409 `Already claimed`.
 */
export const claimBattlePassTierApi =
  endpoint<{
    body: {
      tier: number;
      track:
        | 'free'
        | 'paid';
    };
    res: {
      success: true;
      reward: PassReward;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/battlepass/claim',
    },
  );

/** Spend coins to unlock the premium track. 409 `Already unlocked`; 400 `Not enough coins`. */
export const unlockBattlePassApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/battlepass/unlock',
    },
  );

/** Claim a completed quest's reward. 400 `Quest not claimable`. */
export const claimQuestApi =
  endpoint<{
    res: {
      success: true;
      xp: number;
      coins: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/quests/$id/claim',
    },
  );
