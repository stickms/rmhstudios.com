/**
 * /harmonic — placeholder title screen (H0.1). The playable game arrives in H0.4.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import AppShell from '@/components/shared/AppShell';
import './harmonic.css';

export default function HarmonicPlayPage() {
  const { t } = useTranslation('harmonic');
  return (
    <AppShell appClassName="harmonic-root">
      <main className="harmonic-title-screen">
        <h1 className="harmonic-title">{t('harmonic:title', { defaultValue: 'Harmonic' })}</h1>
        <p className="harmonic-tagline">
          {t('harmonic:tagline', { defaultValue: 'A ship stretched across fifty-nine years.' })}
        </p>
        <p className="harmonic-note">{t('harmonic:in_development', { defaultValue: 'In development' })}</p>
        <Link to="/games" className="harmonic-back">
          {t('harmonic:back_to_games', { defaultValue: 'Back to games' })}
        </Link>
      </main>
    </AppShell>
  );
}
