import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ReportPuzzleDialog } from '@/components/daily-puzzles/ReportPuzzleDialog';
import { useSession } from '@/components/Providers';
import type { DailyPuzzleMode } from '@/lib/daily-puzzles/generate-core';

/**
 * "Something wrong with this puzzle?" for a signed-in member who has a result. It sits under the share row, which only
 * renders once the puzzle is finished, so it cannot hint at the answer; the endpoint refuses a member with no score.
 */
export function PuzzleReportEntry({ gameMode, dateKey }: { gameMode: DailyPuzzleMode; dateKey: string }) {
  const { t } = useTranslation('puzzle-reports');
  const session = useSession();
  const [open, setOpen] = useState(false);
  if (!session.data) return null;
  return (
    <>
      <Button variant="ghost" size="sm" className="text-site-text-muted" onClick={() => setOpen(true)}>
        {t('entry', { defaultValue: 'Something wrong with this puzzle?' })}
      </Button>
      {open ? <ReportPuzzleDialog gameMode={gameMode} dateKey={dateKey} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
