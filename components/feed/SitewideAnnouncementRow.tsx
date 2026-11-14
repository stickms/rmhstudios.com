import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SpineItem } from '@/components/ui/spine';
import { useSitewideAnnouncement } from '@/hooks/useSitewideAnnouncement';
import { useSitewideAnnouncementStore } from '@/stores/sitewideAnnouncementStore';
import { getBusiness } from '@/lib/businesses';
import { isAnnouncementLive, type SitewideAnnouncementSummary } from '@/lib/sitewide-announcement';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/**
 * The live sitewide announcement, pinned at the head of the home feed: a dotless spine item (a notice, not a post) of
 * plain words, an optional picture and two actions. Not dismissible; it goes when the announcement expires. "View
 * announcement" reopens the popup even after it was seen. It renders nothing until the announcement is known, so a
 * visitor without one never sees a gap.
 *
 * `initial` is the announcement the home feed's first page brought with it (app/routes/_site/index.tsx), so on the home
 * page the row is in the same swap as the posts instead of landing above the composer after idle and pushing the
 * column down. Where it still arrives on its own it fades in (Steel M9); `className` carries the streamed-page fade.
 */
export function SitewideAnnouncementRow({
  initial,
  className,
}: {
  initial?: SitewideAnnouncementSummary | null | undefined;
  className?: string | undefined;
} = {}) {
  const { t } = useTranslation('feed');
  const { data } = useSitewideAnnouncement();
  const announcement = data ? data.announcement : (initial ?? null);
  const live = !!announcement && isAnnouncementLive(announcement);
  const arrival = useArrival(live);
  if (!announcement || !live) return null;
  const business = getBusiness(announcement.business);
  const discussionId = announcement.discussionPostId;
  const quietLink = 't-body text-site-text-muted underline hover:text-site-text';

  return (
    <SpineItem
      as="section"
      dot={false}
      className={cn(arrival, className)}
      // The streamed page's class (`className`) is the server's; hydration renders without it and keeps it.
      suppressHydrationWarning
      aria-label={t('sitewide-announcement-region', { defaultValue: 'Sitewide announcement' })}
    >
      <p className="t-meta">
        {business.name} · {t('sitewide-announcement-kind', { defaultValue: 'Announcement' })}
      </p>
      <h2 className="t-heading mt-1">
        {discussionId ? (
          <Link to="/u/$userid/post/$postid" params={{ userid: 'me', postid: discussionId }}>
            {announcement.title}
          </Link>
        ) : (
          announcement.title
        )}
      </h2>
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
        {discussionId ? (
          <>
            <Button asChild size="sm">
              <Link to="/u/$userid/post/$postid" params={{ userid: 'me', postid: discussionId }}>
                {t('sitewide-join-discussion', { defaultValue: 'Join the discussion' })}
              </Link>
            </Button>
            <button
              type="button"
              className={quietLink}
              onClick={() => useSitewideAnnouncementStore.getState().setOpen(true)}
            >
              {t('sitewide-view-announcement', { defaultValue: 'View announcement' })}
            </button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => useSitewideAnnouncementStore.getState().setOpen(true)}
          >
            {t('sitewide-view-announcement', { defaultValue: 'View announcement' })}
          </Button>
        )}
        <Link to="/blog/$slug" params={{ slug: announcement.slug }} className={quietLink}>
          {t('sitewide-read-full-post', { defaultValue: 'Read full post' })}
        </Link>
      </div>
    </SpineItem>
  );
}
