/**
 * /settings/preview: the member's own profile as a signed-out visitor, as a signed-in stranger, and (described, not
 * computed) as a follower or a mutual would see it. Static rows from `GET /api/profile/preview`: no follow button,
 * no composer, no guestbook form, and nothing here changes a setting; each row links to the setting behind it.
 *
 * Member-written text (name, bio, status, posts, quote cards) is isolated with `dir="auto"` or `<bdi>`.
 */
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { getProfilePreviewApi } from '@/lib/profile/preview.contract';
import type {
  PreviewAudience,
  PreviewControl,
  PreviewHeader,
  PreviewPost,
  PreviewQuote,
  PreviewRow,
  PreviewRowId,
  ProfilePreviewResult,
} from '@/lib/profile/preview';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

type PreviewTab = 'signed-out' | 'stranger' | 'follower' | 'mutual';

/** The two real audiences are computed on the server; the other two are read off the same response. */
function audienceOf(tab: PreviewTab): PreviewAudience {
  return tab === 'signed-out' ? 'signed-out' : 'stranger';
}

export function ProfilePreview() {
  const { t } = useTranslation('profile-preview');
  const [tab, setTab] = useState<PreviewTab>('signed-out');
  const audience = audienceOf(tab);
  // Never served from the cache: the point is to check a setting just changed, and the app's one-minute default would
  // show the answer from before the change.
  const query = useQuery({
    ...apiQuery(getProfilePreviewApi, { query: { audience } }),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const arrival = useArrival(!query.isPending);

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        aria-label={t('audience-label', { defaultValue: 'See your profile as' })}
        tabs={[
          { id: 'signed-out', label: t('audience-signed-out', { defaultValue: 'Signed out' }) },
          { id: 'stranger', label: t('audience-stranger', { defaultValue: "A member who doesn't follow you" }) },
          { id: 'follower', label: t('audience-follower', { defaultValue: 'Your followers' }) },
          { id: 'mutual', label: t('audience-mutual', { defaultValue: 'People you follow back' }) },
        ]}
        value={tab}
        onChange={(id) => setTab(id as PreviewTab)}
      />
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : query.isError || !query.data ? (
        <EmptyState
          title={t('error-title', { defaultValue: 'Your preview did not load.' })}
          description={t('error-body', { defaultValue: 'Nothing was changed. Try again in a moment.' })}
          action={
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : (
        <div className={cn('flex flex-col gap-6', arrival)}>
          {tab === 'follower' || tab === 'mutual' ? (
            <DescribedAudience data={query.data} audience={tab} />
          ) : (
            <ComputedAudience data={query.data} />
          )}
        </div>
      )}
    </div>
  );
}

function ComputedAudience({ data }: { data: ProfilePreviewResult }) {
  const { t } = useTranslation('profile-preview');
  return (
    <>
      <p className="t-meta">
        {t('read-only', {
          defaultValue: 'Read only. This is what the site shows this audience today; nothing here can be changed.',
        })}
      </p>
      <HeaderBlock header={data.header} />
      <SettingsSection title={t('sections-title', { defaultValue: 'Sections' })}>
        <RowList rows={data.sections} header={data.header} />
      </SettingsSection>
      <SettingsSection title={t('posts-title', { defaultValue: 'Posts' })}>
        {data.posts.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('no-posts', { defaultValue: 'No posts this audience can see.' })}
          </p>
        ) : (
          <ul>
            {data.posts.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </ul>
        )}
        {data.hasMore ? (
          <p className="t-meta mt-3">{t('more-posts', { defaultValue: 'Older posts are on your profile.' })}</p>
        ) : null}
      </SettingsSection>
    </>
  );
}

function DescribedAudience({ data, audience }: { data: ProfilePreviewResult; audience: 'follower' | 'mutual' }) {
  const { t } = useTranslation('profile-preview');
  const rows = audience === 'follower' ? data.described.follower : data.described.mutual;
  return (
    <SettingsSection
      title={
        audience === 'follower'
          ? t('described-follower-title', { defaultValue: 'What your followers see' })
          : t('described-mutual-title', { defaultValue: 'What people you follow back see' })
      }
      description={t('described-hint', {
        defaultValue: 'Stated from your settings. A follower is not previewed, because that would need a real account.',
      })}
    >
      <RowList rows={rows} header={data.header} />
    </SettingsSection>
  );
}

function RowLabel({ id }: { id: PreviewRowId }) {
  const { t } = useTranslation('profile-preview');
  switch (id) {
    case 'posts':
      return <>{t('row-posts', { defaultValue: 'Posts' })}</>;
    case 'likes':
      return <>{t('row-likes', { defaultValue: 'Likes' })}</>;
    case 'achievements':
      return <>{t('row-achievements', { defaultValue: 'Achievements' })}</>;
    case 'guestbook':
      return <>{t('row-guestbook', { defaultValue: 'Guestbook' })}</>;
    case 'shelves':
      return <>{t('row-shelves', { defaultValue: 'Shelves' })}</>;
    case 'kudos':
      return <>{t('row-kudos', { defaultValue: 'Kudos' })}</>;
    case 'follow-lists':
      return <>{t('row-follow-lists', { defaultValue: 'Follow lists' })}</>;
    case 'presence':
      return <>{t('row-presence', { defaultValue: 'Online status' })}</>;
    case 'activity':
      return <>{t('row-activity', { defaultValue: 'What you are playing' })}</>;
    case 'leaderboards':
      return <>{t('row-leaderboards', { defaultValue: 'Your place on game boards' })}</>;
  }
}

function ControlLink({ control, header }: { control: PreviewControl; header: PreviewHeader }) {
  const { t } = useTranslation('profile-preview');
  if (control === 'privacy') {
    return (
      <Link to="/settings/privacy" className="t-body underline underline-offset-2">
        {t('control-privacy', { defaultValue: 'Privacy settings' })}
      </Link>
    );
  }
  if (control === 'reading') {
    return (
      <Link to="/library" className="t-body underline underline-offset-2">
        {t('control-reading', { defaultValue: 'Shelf settings' })}
      </Link>
    );
  }
  if (control === 'profile') {
    return (
      <Link
        to="/u/$userid"
        params={{ userid: header.handle ?? header.id }}
        className="t-body underline underline-offset-2"
      >
        {t('control-profile', { defaultValue: 'Edit profile' })}
      </Link>
    );
  }
  return null;
}

/** Each row says "Visible" or "Hidden" in words (never by colour or position alone). */
function RowList({ rows, header }: { rows: PreviewRow[]; header: PreviewHeader }) {
  const { t } = useTranslation('profile-preview');
  return (
    <ul>
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-site-border py-3"
        >
          <span className="t-body font-medium">
            <RowLabel id={row.id} />
          </span>
          <span className="flex items-baseline gap-4">
            <span className="t-body">
              {row.visible ? t('visible', { defaultValue: 'Visible' }) : t('hidden', { defaultValue: 'Hidden' })}
            </span>
            <ControlLink control={row.control} header={header} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function HeaderBlock({ header }: { header: PreviewHeader }) {
  const { t, i18n } = useTranslation('profile-preview');
  const fmt = new Intl.NumberFormat(i18n.language);
  const name = header.name ?? header.handle ?? '';
  const presenceState = header.presence.state;
  const presenceText =
    presenceState === 'online'
      ? t('presence-online', { defaultValue: 'Online' })
      : presenceState === 'in_game'
        ? t('presence-in-game', { defaultValue: 'Playing a game' })
        : presenceState === 'away'
          ? t('presence-away', { defaultValue: 'Away' })
          : t('presence-offline', { defaultValue: 'Offline' });
  return (
    <section
      className="flex flex-col gap-3 border-b border-site-border pb-4"
      aria-label={t('header-label', { defaultValue: 'Profile header' })}
    >
      <div className="flex items-center gap-3">
        <UserAvatar src={header.image} alt="" size={56} fallbackName={name} />
        <div className="min-w-0">
          <p dir="auto" className="t-heading break-words">
            {name}
          </p>
          {header.handle ? (
            <p className="t-meta">
              <bdi>@{header.handle}</bdi>
            </p>
          ) : null}
        </div>
      </div>
      {header.status ? (
        <p dir="auto" className="t-body break-words">
          {header.status.emoji ? `${header.status.emoji} ` : ''}
          {header.status.text}
        </p>
      ) : null}
      {header.bio ? (
        <p dir="auto" className="t-body whitespace-pre-wrap break-words">
          {header.bio}
        </p>
      ) : null}
      <p className="t-meta">
        {[header.pronouns, header.location, header.website].filter(Boolean).map((part, i) => (
          <bdi key={i}>
            {i > 0 ? ' · ' : ''}
            {part}
          </bdi>
        ))}
      </p>
      <p className="t-meta">
        {t('count-followers', { defaultValue: '{{value}} followers', value: fmt.format(header.followerCount) })}
        {' · '}
        {t('count-following', { defaultValue: '{{value}} following', value: fmt.format(header.followingCount) })}
        {' · '}
        {t('count-posts', { defaultValue: '{{value}} posts', value: fmt.format(header.postCount) })}
      </p>
      <p className="t-meta">{t('presence-line', { defaultValue: 'Status dot: {{state}}', state: presenceText })}</p>
    </section>
  );
}

function QuoteBlock({ quote }: { quote: PreviewQuote }) {
  const { t } = useTranslation('profile-preview');
  if (quote.state === 'visible') {
    return (
      <blockquote className="mt-2 border-s border-site-border ps-3">
        {quote.author ? (
          <p className="t-meta">
            <bdi>{quote.author}</bdi>
          </p>
        ) : null}
        <p dir="auto" className="t-body break-words">
          {quote.text}
        </p>
      </blockquote>
    );
  }
  return (
    <p className="t-meta mt-2">
      {quote.state === 'deleted'
        ? t('quote-deleted', { defaultValue: 'A quoted post that was deleted' })
        : t('quote-hidden', { defaultValue: "A post you can't see" })}
    </p>
  );
}

function PostRow({ post }: { post: PreviewPost }) {
  const { t } = useTranslation('profile-preview');
  if (post.kind === 'hidden') {
    return (
      <li className="border-b border-site-border py-3">
        <p className="t-body text-site-text-muted">{t('post-hidden', { defaultValue: "A post you can't see" })}</p>
      </li>
    );
  }
  return (
    <li className="border-b border-site-border py-3">
      <p className="t-meta">
        {post.pinned ? `${t('post-pinned', { defaultValue: 'Pinned' })} · ` : ''}
        {post.repost && post.author ? (
          <>
            {t('post-reposted-from', { defaultValue: 'You reposted' })} <bdi>{post.author}</bdi> ·{' '}
          </>
        ) : null}
        <time dateTime={post.createdAt}>{post.createdAt.slice(0, 10)}</time>
      </p>
      {post.contentWarning ? (
        <p dir="auto" className="t-post mt-1 break-words">
          {t('post-covered', { defaultValue: 'Content warning: {{reason}}', reason: post.contentWarning })}
        </p>
      ) : post.locked ? (
        <p className="t-post mt-1 text-site-text-muted">{t('post-locked', { defaultValue: 'A paid post, locked' })}</p>
      ) : (
        <p dir="auto" className="t-post mt-1 whitespace-pre-wrap break-words">
          {post.text}
        </p>
      )}
      {post.quote ? <QuoteBlock quote={post.quote} /> : null}
      {post.hasMedia || post.hasPoll ? (
        <p className="t-meta mt-1">
          {post.hasMedia ? t('post-media', { defaultValue: 'Includes media' }) : ''}
          {post.hasMedia && post.hasPoll ? ' · ' : ''}
          {post.hasPoll ? t('post-poll', { defaultValue: 'Includes a poll' }) : ''}
        </p>
      ) : null}
      <p className="t-meta mt-1">
        {post.counts && post.counts.likes !== null
          ? t('post-counts', {
              defaultValue: '{{likes}} likes · {{replies}} replies · {{reposts}} reposts · {{views}} views',
              likes: post.counts.likes,
              replies: post.counts.replies ?? 0,
              reposts: post.counts.reposts ?? 0,
              views: post.counts.views ?? 0,
            })
          : t('post-counts-hidden', { defaultValue: 'Counts hidden' })}
      </p>
    </li>
  );
}
