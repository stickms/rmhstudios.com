import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { FileText } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { DraftsColumn } from '@/components/feed/DraftsColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { listScheduled } from '@/lib/scheduled/list.server';

// Prefetch drafts + scheduled server-side. `null` when signed out (the page
// gates on the client session and shows a sign-in prompt).
const fetchDrafts = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { drafts: null };
  return { drafts: await listScheduled(session.user.id) };
});

export const Route = createFileRoute('/_site/drafts')({
  head: () => ({ meta: [{ title: 'Drafts | RMH Studios' }] }),
  loader: () => fetchDrafts(),
  component: DraftsPage,
});

function DraftsPage() {
  const { t } = useTranslation("site");
  // The signed-in header lives in DraftsColumn, which reads from the `feed`
  // namespace — reuse the same key here so the title doesn't change on sign-in.
  const { t: tFeed } = useTranslation("feed");
  const { data: session, isPending } = useSession();
  const { drafts } = Route.useLoaderData();

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {session && !isPending ? (
          <DraftsColumn initialData={drafts} />
        ) : (
          /* The gate states get their own header so the mobile drawer button is
             present when signed out / still resolving the session. */
          <>
            <ColumnHeader icon={FileText} title={tFeed('drafts-and-scheduled', { defaultValue: 'Drafts & Scheduled' })} />
            {isPending ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
                <p className="font-medium text-site-text">{t("sign-in-to-manage-drafts", { defaultValue: "Sign in to manage drafts" })}</p>
                <Link to="/login" search={{ callbackURL: '/drafts' }}>
                  <Button variant="accent">{t("sign-in", { defaultValue: "Sign in" })}</Button>
                </Link>
              </div>
            )}
          </>
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
