/**
 * The ghost boxes still to clean (steel-rules.test.ts, kind `ghost-box`): `rounded-site` with horizontal padding and no
 * fill, ring, shadow or border. Per file, the batch that removes it and how many it has now. A file may not gain one, a
 * file whose count fell must lower its number, and an entry with none left must be deleted. Entries only come out.
 */
export const STEEL_GHOST_BASELINE: Record<string, { batch: string; count: number }> = {
  'components/party/ConnectionsPages.tsx': { batch: 'E4 rest', count: 2 },
  'components/themes/ThemeMiniShell.tsx': { batch: 'E4 rest', count: 2 },
  'components/tournaments/BracketView.tsx': { batch: 'E4 rest', count: 3 },
  'components/ui/horizontal-scroller.tsx': { batch: 'E4 rest', count: 1 },
  'components/ui/skeletons/PostCardSkeleton.tsx': { batch: 'E4 rest', count: 1 },
  'components/ui/sortable-list.tsx': { batch: 'E4 rest', count: 1 },
  'components/user-builds/BuildSidebar.tsx': { batch: 'E4 rest', count: 1 },
  'components/wallet/DailyWheel.tsx': { batch: 'E4 rest', count: 1 },
  'components/wallet/StakingCard.tsx': { batch: 'E4 rest', count: 2 },
};
