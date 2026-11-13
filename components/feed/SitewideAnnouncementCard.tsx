'use client';

import { Link } from '@tanstack/react-router';
import { Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AsyncReveal } from '@/components/motion';
import { useSitewideAnnouncement } from '@/hooks/useSitewideAnnouncement';
import { useSitewideAnnouncementStore } from '@/stores/sitewideAnnouncementStore';
import { getBusiness } from '@/lib/businesses';
import { isAnnouncementLive } from '@/lib/sitewide-announcement';

/**
 * The live sitewide announcement, pinned above the short feed banners.
 * Not dismissible: it goes away when the announcement expires. The primary
 * action reopens the popup (even after it was seen).
 */
export function SitewideAnnouncementCard() {
  const { t } = useTranslation('feed');
  const { data } = useSitewideAnnouncement();
  const announcement = data?.announcement ?? null;
  const live = announcement !== null && isAnnouncementLive(announcement);
  const business = getBusiness(announcement?.business);

  return (
    <AsyncReveal show={live} className="px-3 pt-3 pb-1">
      {announcement && (
        <section
          aria-label={t('sitewide-announcement-region', { defaultValue: 'Sitewide announcement' })}
          className="glass-pane rounded-site border-site-accent/40 bg-site-accent-dim p-3"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-site-sm bg-site-accent px-1.5 text-[11px] font-bold leading-none text-site-accent-fg"
            >
              {business.mark}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-site-text">{business.name}</p>
              <p className="flex items-center gap-1 text-xs text-site-accent">
                <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
                {t('sitewide-announcement-label', { defaultValue: 'Announcement' })}
              </p>
            </div>
          </div>

          {announcement.image && (
            <img
              src={announcement.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="mt-3 aspect-[16/9] w-full rounded-site border border-site-border object-cover"
            />
          )}

          <h3 className="mt-3 text-base font-bold text-site-text">{announcement.title}</h3>
          {announcement.description && (
            <p className="mt-1 line-clamp-3 text-sm text-site-text-muted">
              {announcement.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => useSitewideAnnouncementStore.getState().setOpen(true)}
            >
              {t('sitewide-view-announcement', { defaultValue: 'View announcement' })}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/blog/$slug" params={{ slug: announcement.slug }}>
                {t('sitewide-read-full-post', { defaultValue: 'Read full post' })}
              </Link>
            </Button>
          </div>
        </section>
      )}
    </AsyncReveal>
  );
}
