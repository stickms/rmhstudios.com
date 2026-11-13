import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SpineItem } from '@/components/ui/spine';
import { useSitewideAnnouncement } from '@/hooks/useSitewideAnnouncement';
import { useSitewideAnnouncementStore } from '@/stores/sitewideAnnouncementStore';
import { getBusiness } from '@/lib/businesses';
import { isAnnouncementLive } from '@/lib/sitewide-announcement';

/**
 * The live sitewide announcement, pinned at the head of the home feed: a dotless spine item (a notice, not a post) of
 * plain words, an optional picture and two actions. Not dismissible; it goes when the announcement expires. "View
 * announcement" reopens the popup even after it was seen. It renders nothing until the announcement is known, so a
 * visitor without one never sees a gap.
 */
export function SitewideAnnouncementRow() {
  const { t } = useTranslation('feed');
  const { data } = useSitewideAnnouncement();
  const announcement = data?.announcement ?? null;
  if (!announcement || !isAnnouncementLive(announcement)) return null;
  const business = getBusiness(announcement.business);

  return (
    <SpineItem
      as="section"
      dot={false}
      aria-label={t('sitewide-announcement-region', { defaultValue: 'Sitewide announcement' })}
    >
      <p className="t-meta">
        {business.name} · {t('sitewide-announcement-kind', { defaultValue: 'Announcement' })}
      </p>
      <h2 className="t-heading mt-1">{announcement.title}</h2>
      {announcement.description && (
        <p className="t-body mt-1 line-clamp-3 text-site-text-muted">{announcement.description}</p>
      )}
      {announcement.image && (
        <img
          src={announcement.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="mt-3 aspect-video w-full rounded-site border border-site-border bg-site-bg-subtle object-cover"
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="button"
          size="sm"
          onClick={() => useSitewideAnnouncementStore.getState().setOpen(true)}
        >
          {t('sitewide-view-announcement', { defaultValue: 'View announcement' })}
        </Button>
        <Link
          to="/blog/$slug"
          params={{ slug: announcement.slug }}
          className="t-body text-site-text-muted underline hover:text-site-text"
        >
          {t('sitewide-read-full-post', { defaultValue: 'Read full post' })}
        </Link>
      </div>
    </SpineItem>
  );
}
