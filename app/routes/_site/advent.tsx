import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import AdventCalendar from '@/components/gifting/AdventCalendar';
import { Gift } from 'lucide-react';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useSession } from '@/components/Providers';
import { noindexHead } from '@/lib/seo';

export const Route = createFileRoute('/_site/advent')({
  head: () => noindexHead('Advent Calendar'),
  component: AdventPage,
});

function AdventPage() {
  const { t } = useTranslation('f-gifting');
  const { data: session } = useSession();
  return (
    <PageLayout
      title={t('advent-title', { defaultValue: 'Advent calendar' })}
      description={t('advent-desc', { defaultValue: 'A door a day through December.' })}
    >
      {session?.user ? (
        <div className="px-4 pt-4 pb-12">
          <AdventCalendar />
        </div>
      ) : (
        <SignedOutPrompt
          icon={Gift}
          title={t('advent-signin', { defaultValue: 'Sign in to open your doors.' })}
          callbackURL="/advent"
        />
      )}
    </PageLayout>
  );
}
