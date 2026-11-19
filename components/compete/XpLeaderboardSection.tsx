/**
 * The Leaderboard section of `/compete`: the global player (XP) leaderboard.
 *
 * It was the Leaderboard sub-tab of the Arcade Pass on `/arcade` until the
 * 2026-11-19 consolidation put every standings board on one page; `/leaderboard`
 * and `/arcade?sub=leaderboard` land here now. The board loads client-side the
 * first time the tab is opened, as it did there, and is kept for the life of the
 * page.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { LeaderboardColumn } from '@/components/feed/LeaderboardColumn';
import { api } from '@/lib/contract/client';
import { playerLeaderboardApi } from '@/lib/leaderboard.contract';

/** The board payload, taken from the column that renders it. */
type LeaderboardData = React.ComponentProps<typeof LeaderboardColumn>['initialData'];

export function XpLeaderboardSection() {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const [board, setBoard] = useState<LeaderboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const arrival = useArrival(board !== null || failed);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await api(playerLeaderboardApi, { query: { scope: 'global' } });
        if (active) setBoard(res as LeaderboardData);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (board) {
    return (
      <div className={arrival}>
        <LeaderboardColumn initialData={board} signedIn={Boolean(session)} hideHeader />
      </div>
    );
  }
  if (failed) {
    return (
      <EmptyState
        className={arrival}
        icon={Trophy}
        title={t('leaderboard-failed', {
          defaultValue: 'Could not load the leaderboard just now.',
        })}
      />
    );
  }
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}
