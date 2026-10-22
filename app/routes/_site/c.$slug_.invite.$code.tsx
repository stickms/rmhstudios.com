import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { PageFrame } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LockedCommunityPreview } from '@/components/communities/LockedCommunity';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { useSession } from '@/components/Providers';
import { getRequestSession } from '@/lib/auth-session.server';
import { getInvitePreview, type InvitePreview } from '@/lib/communities/invite-preview.server';

// Resolve the invite on the server so a bad code never renders anything about
// the community, and a valid one renders the locked preview at first paint.
const fetchInvite = createServerFn({ method: 'GET' })
  .validator((input: { slug: string; code: string }) => input)
  .handler(async ({ data }): Promise<InvitePreview> => {
    const session = await getRequestSession();
    return getInvitePreview(getRequest(), data.slug, data.code, session?.user?.id ?? null);
  });

export const Route = createFileRoute('/_site/c/$slug_/invite/$code')({
  // An invite link is a credential: never indexed, never followed.
  head: () => ({
    meta: [
      { title: 'Community invite | RMH Studios' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  loader: ({ params }) => fetchInvite({ data: { slug: params.slug, code: params.code } }),
  component: InvitePage,
});

function InvitePage() {
  const { slug, code } = Route.useParams();
  const preview = Route.useLoaderData() as InvitePreview;
  const { t } = useTranslation('f-communities-plus');
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (preview.state === 'invalid') {
    // One generic state for every reason a link can be unusable.
    return (
      <PageFrame>
        <EmptyState
          icon={Lock}
          title={t('invite-invalid-title', { defaultValue: "This invite isn't valid" })}
          description={t('invite-invalid-body', {
            defaultValue:
              'It may have expired, been revoked or reached its limit. Ask for a new link.',
          })}
          action={
            <Button asChild variant="outline">
              <Link to="/communities">
                {t('invite-browse', { defaultValue: 'Browse communities' })}
              </Link>
            </Button>
          }
        />
      </PageFrame>
    );
  }

  if (preview.state === 'member') {
    return (
      <PageFrame>
        <EmptyState
          icon={Lock}
          title={t('invite-member-title', { defaultValue: "You're already in" })}
          action={
            <Button asChild variant="accent">
              <Link to={`/c/${preview.slug}` as string}>
                {t('invite-open', { defaultValue: 'Open the community' })}
              </Link>
            </Button>
          }
        />
      </PageFrame>
    );
  }

  const join = async () => {
    setBusy(true);
    const res = await plusFetch(communityApi(slug, '/join'), 'POST', { invite: code });
    setBusy(false);
    if (!res.ok) {
      toast.error(t('invite-join-error', { defaultValue: "This invite isn't valid" }));
      return;
    }
    toast.success(t('invite-joined', { defaultValue: 'Welcome in!' }));
    void navigate({ to: `/c/${slug}` as string });
  };

  const { community } = preview;
  return (
    <PageFrame>
      <div className="px-4 pt-6 pb-12">
        <LockedCommunityPreview community={community} requestState={community.requestState}>
          {session ? (
            <Button variant="accent" onClick={join} disabled={busy}>
              {t('invite-join', { defaultValue: 'Join' })}
            </Button>
          ) : (
            <Button asChild variant="accent">
              <Link to="/login" search={{ callbackURL: `/c/${slug}/invite/${code}` }}>
                {t('invite-signin', { defaultValue: 'Sign in to join' })}
              </Link>
            </Button>
          )}
        </LockedCommunityPreview>
      </div>
    </PageFrame>
  );
}
