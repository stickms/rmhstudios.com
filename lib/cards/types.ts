/** Client-safe shapes for the trading-card surfaces. */

export type CardStack = {
  gameId: string;
  cardIndex: number;
  foil: boolean;
  count: number;
};

export type BadgeView = {
  gameId: string;
  foil: boolean;
  level: number;
};

export type GrantedDrop = {
  gameId: string;
  cardIndex: number;
  foil: boolean;
  name: string;
};

/** One title's trading-card state for one user, as the game page shows it. */
export type TitleCards = {
  /** Count of each card, normal finish, in set order. */
  owned: number[];
  /** Count of each card, foil finish. */
  foilOwned: number[];
  dropsEarned: number;
  dropsGranted: number;
  /** Drops still to come from playtime (the title's cap minus what has dropped). */
  dropsRemaining: number;
  badgeLevel: number;
  foilBadge: boolean;
  canCraft: boolean;
  canCraftFoil: boolean;
};

export type CraftResult =
  | { ok: true; level: number; foil: boolean; xp: number }
  | { ok: false; reason: 'missing-cards' | 'max-level' | 'unknown-title' };

export type InventoryGroup = {
  gameId: string;
  title: string;
  hue: number;
  /** Cards held, in set order then finish; `count` is the stack size. */
  cards: { cardIndex: number; foil: boolean; count: number }[];
  badgeLevel: number;
  foilBadge: boolean;
  /** Drops this title still has to give. */
  dropsRemaining: number;
};

export type InventoryData = {
  groups: InventoryGroup[];
  totalCards: number;
  gems: number;
  /** The viewer's coin balance (for buying gems). */
  coins: number;
  /** Titles a booster pack can be opened for. */
  packTitles: { id: string; title: string }[];
};
