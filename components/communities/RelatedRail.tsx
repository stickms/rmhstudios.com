'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import type { SisterDTO } from '@/lib/communities/plus-schema';

/** N8 — the "Related communities" rail. */
export function RelatedRail({ sisters }: { sisters: SisterDTO[] }) {
  const { t } = useTranslation('f-communities-plus');
  if (sisters.length === 0) return null;
  return (
    <nav
      aria-label={t('related-title', { defaultValue: 'Related communities' })}
      className="border-b border-site-border px-4 py-3"
    >
      <h3 className="site-section-label mb-2 flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        {t('related-title', { defaultValue: 'Related communities' })}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {sisters.map((s) => (
          <li key={s.slug}>
            <Link
              to={`/c/${s.slug}` as string}
              className="glass-fill flex items-center gap-2 rounded-site px-3 py-1.5 text-sm text-site-text hover:bg-site-surface-hover focus-visible:ring-2 focus-visible:ring-site-accent"
            >
              <span aria-hidden>{s.icon || '👥'}</span>
              <span className="font-medium">{s.name}</span>
              {s.mutual && (
                <span className="text-[0.65rem] font-semibold text-site-accent">
                  {t('related-mutual', { defaultValue: 'Mutual' })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
