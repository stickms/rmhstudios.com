/** Client-safe shapes for trade offers. */

export type TradeCard = {
  gameId: string;
  title: string;
  hue: number;
  cardIndex: number;
  foil: boolean;
  qty: number;
};

export type TradeView = {
  id: string;
  direction: 'in' | 'out';
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  partner: { userId: string; handle: string | null; name: string; image: string | null };
  /** What the viewer hands over. */
  yourCards: TradeCard[];
  /** What the viewer receives. */
  theirCards: TradeCard[];
};

export type TradeData = {
  incoming: TradeView[];
  outgoing: TradeView[];
  history: TradeView[];
};

export type TradeInventories = { mine: TradeCard[]; theirs: TradeCard[] };
