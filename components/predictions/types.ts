// Client mirror of `SerializedMarket` from lib/predictions/predictions.server.ts.
export interface Market {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'OPEN' | 'RESOLVED_YES' | 'RESOLVED_NO' | 'DENIED';
  isAiGenerated: boolean;
  yesPercent: number;
  volume: number;
  closesAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  creator: { id: string; name: string | null; handle: string | null; image: string | null } | null;
  position: { yesShares: number; noShares: number; spent: number; settled: boolean } | null;
}
