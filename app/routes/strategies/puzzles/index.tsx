import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDoctrineReputation } from '@/hooks/useDoctrineReputation';
import { StreakDisplay } from '@/components/doctrine/puzzles/streak-display';
import { Puzzle } from 'lucide-react';

export const Route = createFileRoute('/strategies/puzzles/')({
  component: PuzzlesIndex,
});

const MODE_INFO: Record<string, { name: string; descriptionKey: string; descriptionDefault: string; color: string }> = {
  ALIBI: { name: 'Alibi', descriptionKey: 'mode-alibi-desc', descriptionDefault: 'Find the liar among suspects', color: '#EF4444' },
  SPECTRUM: { name: 'Spectrum', descriptionKey: 'mode-spectrum-desc', descriptionDefault: 'Arrange items on a scale', color: '#8B5CF6' },
  OUTCAST: { name: 'Outcast', descriptionKey: 'mode-outcast-desc', descriptionDefault: "Find the word that doesn't belong", color: '#22C55E' },
  CHAINLINK: { name: 'Chainlink', descriptionKey: 'mode-chainlink-desc', descriptionDefault: 'Connect words in a chain', color: '#3B82F6' },
  IMPOSTOR: { name: 'Impostor', descriptionKey: 'mode-impostor-desc', descriptionDefault: 'Spot the wrong definition', color: '#F59E0B' },
};

function PuzzlesIndex() {
  const { t } = useTranslation("r-strategies");
  const { data: rep } = useDoctrineReputation();

  const { data: puzzles, isLoading } = useQuery({
    queryKey: ['doctrine', 'puzzles', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/doctrine/puzzles/today');
      return res.json();
    },
    staleTime: 60_000,
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
            {t("todays-puzzles", { defaultValue: "Today's Puzzles" })}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--doctrine-text-muted)' }}>
            {t("puzzles-tagline", { defaultValue: "One thing. Maximum intensity. No second chances." })}
          </p>
        </div>
        {rep && <StreakDisplay streak={rep.currentStreak} longestStreak={rep.longestStreak} />}
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-28 rounded-lg animate-pulse" style={{ background: 'var(--doctrine-bg-secondary)' }} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {puzzles?.map((puzzle: { id: string; mode: string; difficulty: number; isSahur: boolean }) => {
          const info = MODE_INFO[puzzle.mode] ?? { name: puzzle.mode, descriptionKey: '', descriptionDefault: '', color: '#6B7280' };

          return (
            <a
              key={puzzle.id}
              href={`/strategies/puzzles/${puzzle.mode.toLowerCase()}`}
              className="block rounded-lg p-5 space-y-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
              style={{
                background: 'var(--doctrine-bg-secondary)',
                border: `1px solid ${info.color}20`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase" style={{ color: info.color }}>
                  {info.name}
                </span>
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: i < puzzle.difficulty ? info.color : 'rgba(255,255,255,0.1)' }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-white/80">{info.descriptionKey ? t(info.descriptionKey, { defaultValue: info.descriptionDefault }) : info.descriptionDefault}</p>
              {puzzle.isSahur && (
                <span className="text-[10px] font-bold text-amber-400">{t("sahur-exclusive", { defaultValue: "SAHUR EXCLUSIVE" })}</span>
              )}
            </a>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Link
          to="/strategies/puzzles/archive"
          className="text-xs text-white/30 hover:text-white/50 transition-colors"
        >
          {t("browse-archive", { defaultValue: "Browse Archive →" })}
        </Link>
        <Link
          to="/strategies/puzzles/leaderboard"
          className="text-xs text-white/30 hover:text-white/50 transition-colors"
        >
          {t("leaderboards", { defaultValue: "Leaderboards →" })}
        </Link>
      </div>
    </div>
  );
}
