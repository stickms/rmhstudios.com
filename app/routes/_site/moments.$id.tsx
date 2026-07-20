/**
 * Public landing page for a shared moment (§13).
 *
 * Renders the moment's stat card and points `head()` at the OG image route so
 * the link unfurls with the branded card. Exists only for moments the user chose
 * to share; a deleted moment 404s here and at the image route.
 */

import { createFileRoute, notFound, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { Button } from '@/components/ui/button';
import { buildMeta, buildCanonical } from '@/lib/seo';
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
    const label = m ? KIND_LABELS[m.kind] ?? 'Milestone' : 'Moment';
    const title = m ? `${who} — ${m.payload.value} | RMH Studios` : 'Moment | RMH Studios';
    const description = m
      ? `${label} on RMH Studios${m.payload.subtitle ? ` · ${m.payload.subtitle}` : ''}`
      : 'A shared moment on RMH Studios.';
    const path = `/moments/${params.id}`;
    return {
      meta: buildMeta({ title, description, path, image: `/api/og/moment/${params.id}` }),
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
    (moment.user.handle ? `@${moment.user.handle}` : t('moment-a-member', { defaultValue: 'A member' }));

  return (
    <>
      <AnimatedMain className="w-full min-w-0 border-r border-site-border pb-dock">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-12 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-site-accent">{label}</p>

          <div className="w-full overflow-hidden rounded-site border border-site-border shadow-site">
            <img
              src={`/api/og/moment/${id}`}
              alt={`${who}: ${moment.payload.value}`}
              width={1200}
              height={630}
              className="h-auto w-full"
            />
          </div>

          <div className="flex flex-col items-center gap-1">
            <h1 className="text-2xl font-bold text-site-text">{moment.payload.value}</h1>
            {moment.payload.subtitle && (
              <p className="text-site-text-muted">{moment.payload.subtitle}</p>
            )}
            <p className="mt-1 text-sm text-site-text-dim">
              {who}
              {moment.user.handle && moment.user.name ? ` · @${moment.user.handle}` : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {moment.user.handle && (
              <Link to="/profile/$id" params={{ id: moment.user.id }}>
                <Button variant="outline">
                  {t('moment-view-profile', { defaultValue: 'View profile' })}
                </Button>
              </Link>
            )}
            <Link to="/">
              <Button variant="accent">
                {t('moment-explore', { defaultValue: 'Explore RMH Studios' })}
              </Button>
            </Link>
          </div>
        </div>
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
