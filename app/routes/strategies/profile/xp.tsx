import { createFileRoute, Link } from '@tanstack/react-router';
import { noindexHead } from '@/lib/seo';
import { useTranslation } from 'react-i18next';
import { ListOrdered } from 'lucide-react';
import { XpLedger } from '@features/doctrine/ui/reputation/xp-ledger';

export const Route = createFileRoute('/strategies/profile/xp')({
  head: () => noindexHead('Strategies XP Breakdown'),
  component: XpPage,
});

function XpPage() {
  const { t } = useTranslation('doctrine-ledger');
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <ListOrdered size={20} aria-hidden style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          {t('title', { defaultValue: 'XP breakdown' })}
        </h1>
      </div>
      <XpLedger />
      <Link
        to="/strategies/profile"
        className="flex min-h-11 items-center text-sm text-white/50 transition-colors hover:text-white/80 md:min-h-0"
      >
        {t('back', { defaultValue: 'Back to profile' })}
      </Link>
    </div>
  );
}
