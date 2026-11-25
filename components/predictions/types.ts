// Client mirror of `SerializedMarket` from lib/predictions/predictions.server.ts.
export interface Market {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'OPEN' | 'RESOLVED_YES' | 'RESOLVED_NO' | 'DENIED';
  isAiGenerated: boolean;
  /** Self-referential market that settles from the platform's own data. */
  isAuto: boolean;
  /** In-app deep link to the subject of an auto market. */
  subjectUrl: string | null;
  yesPercent: number;
  /** Public LMSR state; the card quotes a trade from it. */
  qYes: number;
  qNo: number;
  b: number;
  volume: number;
  closesAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  creator: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  } | null;
  position: {
    yesShares: number;
    noShares: number;
    spent: number;
    received: number;
    settled: boolean;
  } | null;
}
