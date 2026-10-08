import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { WrappedColumn } from '@/components/feed/WrappedColumn';
import { useSession } from '@/components/Providers';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from 'react-i18next';
import { auth } from '@/lib/auth';
import { getYearlyWrapped } from '@/lib/wrapped.server';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

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
  component: WrappedPage });

function WrappedPage() {
  const { t } = useTranslation("site");
  const { data: session, isPending } = useSession();
  const { wrapped } = Route.useLoaderData();

  return (
    <>
      <PageFrame>
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <SignedOutPrompt
            callbackURL="/wrapped"
            title={t("sign-in-to-see-wrapped", { defaultValue: "Sign in to see your Wrapped" })}
          />
        ) : (
          <WrappedColumn initialData={wrapped} />
        )}
      </PageFrame>
    </>
  );
}
