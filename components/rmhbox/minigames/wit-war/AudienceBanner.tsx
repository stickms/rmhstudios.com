'use client';

import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Shown to spectators during a Wit-War vote: their picks merge into one audience vote. */
export default function AudienceBanner({ count }: { count: number }) {
  const { t } = useTranslation('f-party');
  return (
    <p className="mb-2 flex items-center justify-center gap-2 text-center text-xs text-(--app-text-muted)">
      <Users className="h-3.5 w-3.5" aria-hidden />
      {t('audience-banner', {
        defaultValue: 'You are in the audience: {{voters}} voting. The crowd counts as one vote.',
        voters: count,
      })}
    </p>
  );
}
