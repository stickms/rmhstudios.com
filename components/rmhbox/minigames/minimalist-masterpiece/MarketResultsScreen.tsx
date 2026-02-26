/**
 * MarketResultsScreen — Final rankings with de-anonymization and investment bonuses.
 */
'use client';

import DrawingCard from './DrawingCard';
import type { MMStroke } from './DrawingCard';

interface MMRanking {
  drawingId: string;
  artistUserId: string;
  artistUserName: string;
  marketValue: number;
  rank: number;
  points: number;
  strokes: MMStroke[];
  backgroundColor?: string;
}

interface InvestmentBonus {
  userId: string;
  userName: string;
  bonusPoints: number;
  investedIn: string;
}

interface MarketResultsScreenProps {
  rankings: MMRanking[];
  investmentBonuses: InvestmentBonus[];
  prompt: string;
}

export default function MarketResultsScreen({
  rankings,
  investmentBonuses,
  prompt,
}: MarketResultsScreenProps) {
  return (
    <div className="flex flex-col items-center gap-6 p-4">
      <h2 className="text-xl font-bold text-(--rmhbox-text)">Market Results</h2>
      <p className="text-sm text-(--rmhbox-text-muted)">Prompt: &quot;{prompt}&quot;</p>

      {/* Rankings */}
      <div className="w-full max-w-md space-y-3">
        {rankings.map((r) => (
          <div
            key={r.drawingId}
            className="flex items-center gap-3 p-3 rounded-lg border border-(--rmhbox-border)"
          >
            <span className="text-2xl font-bold text-(--rmhbox-accent) w-8 text-center">
              #{r.rank}
            </span>
            <DrawingCard strokes={r.strokes} backgroundColor={r.backgroundColor} className="w-16 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-(--rmhbox-text) truncate">
                {r.artistUserName}
              </p>
              <p className="text-xs text-(--rmhbox-text-muted)">
                Market value: {r.marketValue} • +{r.points} pts
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Investment bonuses */}
      {investmentBonuses.length > 0 && (
        <div className="w-full max-w-md">
          <h3 className="text-sm font-semibold text-(--rmhbox-text) mb-2">
            Investment Bonuses
          </h3>
          <div className="space-y-1">
            {investmentBonuses.map((b, i) => (
              <div
                key={`${b.userId}-${i}`}
                className="flex justify-between text-xs text-(--rmhbox-text-muted)"
              >
                <span>
                  {b.userName} invested in {b.investedIn}
                </span>
                <span className="text-(--rmhbox-accent)">+{b.bonusPoints} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
