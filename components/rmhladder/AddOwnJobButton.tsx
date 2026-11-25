/**
 * "Add a job you found elsewhere" (sprint 13, feature 08): the pipeline's one primary button and the lazy-loaded form it
 * opens, so the zod schema the form validates with stays off the route until the member asks for it.
 */
import { lazy, Suspense, useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

const OwnJobDialog = lazy(() => import('./OwnJobDialog'));

export function AddOwnJobButton({ ownJobCount, onAdded }: { ownJobCount: number; onAdded: () => void }) {
  const { t } = useTranslation('ladder-own-jobs');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="primary" className="min-h-11" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {t('add.button', { defaultValue: 'Add a job you found elsewhere' })}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <OwnJobDialog open onOpenChange={setOpen} ownJobCount={ownJobCount} onSaved={onAdded} />
        </Suspense>
      )}
    </>
  );
}
