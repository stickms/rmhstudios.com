import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { FileText } from 'lucide-react';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { DraftsColumn } from '@/components/feed/DraftsColumn';
import { useSession } from '@/components/Providers';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { getRequestSession } from '@/lib/auth-session.server';
import { listScheduled } from '@/lib/scheduled/list.server';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { TimeCapsuleList } from '@/components/posts-plus/TimeCapsuleList';

// Prefetch drafts + scheduled server-side. `null` when signed out (the page
// gates on the client session and shows a sign-in prompt).
const fetchDrafts = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) return { drafts: null };
  return { drafts: await listScheduled(session.user.id) };
});

export const Route = createFileRoute('/_site/drafts')({
  head: () => ({ meta: [{ title: 'Drafts | RMH Studios' }] }),
  loader: () => fetchDrafts(),
  component: DraftsPage });

function DraftsPage() {
  const { t } = useTranslation('site');
  // The signed-in header lives in DraftsColumn, which reads from the `feed`
  // namespace — reuse the same key here so the title doesn't change on sign-in.
  const { t: tFeed } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const { drafts } = Route.useLoaderData();

  return (
    <>
      <PageFrame>
        {session && !isPending ? (
          <>
            <DraftsColumn initialData={drafts} />
            <TimeCapsuleList />
          </>
        ) : (
          /* The gate states get their own header so the mobile drawer button is
             present when signed out / still resolving the session. */
          <>
            <ColumnHeader
              icon={FileText}
              title={tFeed('drafts-and-scheduled', { defaultValue: 'Drafts & Scheduled' })}
            />
            {isPending ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <SignedOutPrompt
                callbackURL="/drafts"
                title={t('sign-in-to-manage-drafts', { defaultValue: 'Sign in to manage drafts' })}
              />
            )}
          </>
        )}
      </PageFrame>
    </>
  );
}
