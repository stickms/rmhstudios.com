/**
 * The "Keys" section of the progress page: the member's per-key statistics, the heatmap and the weighted practice
 * test. A generated or pasted test is handed to the solo page through the store and opens there as a practice run,
 * which stays off the boards.
 */
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { TypingStats } from '@/components/rmhtype/TypingStats';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import type { GeneratedTest } from '@/lib/rmhtype/custom-test';

export function KeysSection() {
  const { t } = useTranslation('weak-keys');
  const router = useRouter();

  const start = (test: GeneratedTest) => {
    useRmhTypeStore.getState().setPendingPractice(test.text);
    void router.navigate({ to: '/rmhtype/solo' });
  };

  return (
    <section className="mt-10 border-t border-app-border pt-6" aria-labelledby="keys-heading">
      <h2 id="keys-heading" className="t-heading mb-3">
        {t('section-title', { defaultValue: 'Keys' })}
      </h2>
      <TypingStats onStartTest={start} />
    </section>
  );
}
