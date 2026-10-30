'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The right-hand pane for library pages that bring their own content (a guide, the
 * Slice It! hub). Gives them the heading and a way back; the content itself is
 * existing site components, brought onto the Steam palette by `.stm-legacy`.
 */
export function SteamPane({
  title,
  backTo = '/games',
  children,
}: {
  title?: string;
  backTo?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('games-hub');
  return (
    <section className="stm-pane-page">
      <Link to={backTo} className="stm-back">
        <ArrowLeft aria-hidden />
        {t('steam-back', { defaultValue: 'Back' })}
      </Link>
      {title ? <h1 className="stm-pane-title">{title}</h1> : null}
      <div className="stm-legacy">{children}</div>
    </section>
  );
}
