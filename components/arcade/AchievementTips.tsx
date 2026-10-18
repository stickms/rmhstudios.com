'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';

const TipsDialog = lazy(() =>
  import('./AchievementTipsDialog').then((m) => ({ default: m.AchievementTipsDialog })),
);

/** Small "Tips" trigger on an achievement tile; the sheet itself loads on first click. */
export function AchievementTips({ achievementId, name }: { achievementId: string; name: string }) {
  const { t } = useTranslation('f-arcade');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="xs" className="mt-1.5" onClick={() => setOpen(true)}>
        <Lightbulb aria-hidden />
        {t('tips-button', { defaultValue: 'Tips' })}
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <TipsDialog achievementId={achievementId} name={name} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
