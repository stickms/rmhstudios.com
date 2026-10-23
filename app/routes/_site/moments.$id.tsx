/**
 * Public landing page for a shared moment (§13).
 *
 * Renders the moment's stat card and points `head()` at the OG image route so
 * the link unfurls with the branded card. Exists only for moments the user chose
 * to share; a deleted moment 404s here and at the image route.
 */

import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildMeta, buildCanonical, ogCardPath } from '@/lib/seo';
import { getMoment } from '@/lib/moments.server';

const KIND_LABELS: Record<string, string> = {
  achievement: 'Achievement unlocked',
  rank: 'Rank up',
  streak: 'Streak milestone',
  pass_tier: 'Battle pass',
  arcade: 'Arcade clear',
  wrapped_stat: 'RMH Wrapped',
  market: 'Marketplace',
};

const fetchMoment = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const moment = await getMoment(id);
    if (!moment) throw notFound();
    return { moment };
  });

export const Route = createFileRoute('/_site/moments/$id')({
  loader: ({ params }) => fetchMoment({ data: params.id }),
  head: ({ loaderData, params }) => {
    const m = loaderData?.moment;
    const who = m?.user?.name || (m?.user?.handle ? `@${m.user.handle}` : 'Someone');
    const label = m ? (KIND_LABELS[m.kind] ?? 'Milestone') : 'Moment';
    const title = m ? `${who} — ${m.payload.value} | RMH Studios` : 'Moment | RMH Studios';
    const description = m
      ? `${label} on RMH Studios${m.payload.subtitle ? ` · ${m.payload.subtitle}` : ''}`
      : 'A shared moment on RMH Studios.';
    const path = `/moments/${params.id}`;
    return {
      meta: buildMeta({
        title,
        description,
        path,
        image: ogCardPath('moment', params.id),
        imageAlt: m ? `${label}: ${m.payload.value}` : undefined,
      }),
      links: [buildCanonical(path)],
    };
  },
  component: MomentPage,
});

function MomentPage() {
  const { t } = useTranslation('site');
  const { moment } = Route.useLoaderData();
  const { id } = Route.useParams();
  const label = KIND_LABELS[moment.kind] ?? 'Milestone';
  const who =
    moment.user.name ||
    (moment.user.handle
      ? `@${moment.user.handle}`
      : t('moment-a-member', { defaultValue: 'A member' }));
  const byline = `${who}${moment.user.handle && moment.user.name ? ` · @${moment.user.handle}` : ''}`;

  return (
    <PageLayout
      title={moment.payload.value}
      wrapTitle
      description={moment.payload.subtitle ?? undefined}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4 pb-12">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{label}</Badge>
          <span className="text-sm text-site-text-dim">{byline}</span>
        </div>

        <div className="overflow-hidden rounded-site border border-site-border">
          <img
            src={`/api/og/moment/${id}`}
            alt={`${who}: ${moment.payload.value}`}
            width={1200}
            height={630}
            className="h-auto w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {moment.user.handle && (
            <Button variant="outline" asChild>
              <Link to="/u/$userid" params={{ userid: moment.user.handle }}>
                {t('moment-view-profile', { defaultValue: 'View profile' })}
              </Link>
            </Button>
          )}
          <Button variant="accent" asChild>
            <Link to="/">{t('moment-explore', { defaultValue: 'Explore RMH Studios' })}</Link>
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
