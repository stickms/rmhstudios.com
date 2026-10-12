'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Download, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** P10 profile card (QR) and the doorway to webrings (P6). */
export default function ShareSettings({ handleOrId }: { handleOrId: string }) {
  const { t } = useTranslation('f-profile-plus');
  const [loaded, setLoaded] = useState(false);
  const src = `/api/profile/${encodeURIComponent(handleOrId)}/card`;

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="share-card">
        <h3 id="share-card" className="text-sm font-semibold text-site-text">
          {t('card-title', { defaultValue: 'Your profile card' })}
        </h3>
        <p className="text-sm text-site-text-muted">
          {t('card-description', {
            defaultValue:
              'A shareable image with a QR code that opens your profile. Print it, post it, or keep it on your phone.',
          })}
        </p>
        <div className="relative aspect-[1200/630] w-full max-w-xl overflow-hidden rounded-site-sm">
          {!loaded ? <Skeleton className="absolute inset-0" /> : null}
          <img
            src={src}
            alt={t('card-alt', { defaultValue: 'Your profile card with a QR code' })}
            width={1200}
            height={630}
            loading="lazy"
            className="size-full object-cover"
            onLoad={() => setLoaded(true)}
          />
        </div>
        <Button asChild variant="accent" size="sm">
          <a href={`${src}?download=1`} download>
            <Download aria-hidden />
            {t('card-download', { defaultValue: 'Download PNG' })}
          </a>
        </Button>
      </section>

      <section className="space-y-3" aria-labelledby="share-rings">
        <h3 id="share-rings" className="text-sm font-semibold text-site-text">
          {t('rings-title', { defaultValue: 'Webrings' })}
        </h3>
        <p className="text-sm text-site-text-muted">
          {t('rings-description', {
            defaultValue:
              'Join a ring of members who share your thing, or start your own. Rings you join show a previous / next strip on your profile.',
          })}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/rings">
            <Link2 aria-hidden />
            {t('rings-open', { defaultValue: 'Browse webrings' })}
          </Link>
        </Button>
      </section>
    </div>
  );
}
