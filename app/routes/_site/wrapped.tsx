import { createFileRoute, Link } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { WrappedColumn } from '@/components/feed/WrappedColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { getYearlyWrapped } from '@/lib/wrapped.server';

// Aggregate the current year's Wrapped server-side so it's present at first
// paint / prefetched on intent instead of fetched on mount. Signed-out visitors
// get `null` (and see the sign-in prompt below).
const fetchWrapped = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session) return { wrapped: null };
  return { wrapped: await getYearlyWrapped(session.user.id) };
});

export const Route = createFileRoute('/_site/wrapped')({
  head: () => ({ meta: [{ title: 'Wrapped | RMH Studios' }] }),
  loader: () => fetchWrapped(),
  component: WrappedPage,
});

function WrappedPage() {
  const { t } = useTranslation("site");
  const { data: session, isPending } = useSession();
  const { wrapped } = Route.useLoaderData();

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <p className="font-medium text-site-text">{t("sign-in-to-see-wrapped", { defaultValue: "Sign in to see your Wrapped" })}</p>
            <Link to="/login" search={{ callbackURL: '/wrapped' }}>
              <Button variant="accent">{t("sign-in", { defaultValue: "Sign in" })}</Button>
            </Link>
          </div>
        ) : (
          <WrappedColumn initialData={wrapped} />
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
