'use client';

/** Entry points to the seasonal gifting pages, shown under the scheduled-gift form. */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CalendarHeart, Gift } from 'lucide-react';

export default function GiftingLinks() {
  const { t } = useTranslation('f-gifting');
  const cls =
    'glass-fill flex items-center gap-2 rounded-site-sm p-3 text-sm text-site-text hover:text-site-accent';
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Link to="/advent" className={cls}>
        <CalendarHeart className="size-4" aria-hidden />
        {t('links-advent', { defaultValue: 'Advent calendar: a free door every day in December' })}
      </Link>
      <Link to="/exchange" className={cls}>
        <Gift className="size-4" aria-hidden />
        {t('links-exchange', { defaultValue: 'Gift and mixtape exchanges with friends' })}
      </Link>
    </div>
  );
}
