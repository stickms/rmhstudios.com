import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { DeveloperColumn } from '@/components/feed/DeveloperColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useTranslation } from "react-i18next";

export const Route = createFileRoute('/_site/developer')({
  head: () => ({ meta: [{ title: 'Developer API | RMH Studios' }] }),
  component: DeveloperPage,
});

function DeveloperPage() {
  const { t } = useTranslation("site");
  const { data: session, isPending } = useSession();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <p className="font-medium text-site-text">{t("sign-in-to-manage-developer-keys", { defaultValue: "Sign in to manage developer keys" })}</p>
            <Link to="/login" search={{ callbackURL: '/developer' }}>
              <Button variant="accent">{t("sign-in", { defaultValue: "Sign in" })}</Button>
            </Link>
          </div>
        ) : (
          <DeveloperColumn />
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
