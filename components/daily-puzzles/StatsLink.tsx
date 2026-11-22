import { Link } from '@tanstack/react-router';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** The hub's way to `/daily/stats`. */
export function StatsLink() {
  const { t } = useTranslation('daily-stats');
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/daily/stats">
        <BarChart3 aria-hidden />
        {t('statistics', {
          defaultValue: 'Statistics',
        })}
      </Link>
    </Button>
  );
}
