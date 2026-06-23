import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ClansColumn } from '@/components/feed/ClansColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_site/clans/')({
  head: () => ({ meta: [{ title: 'Clans | RMH Studios' }] }),
  component: ClansPage,
});

function ClansPage() {
  const { t } = useTranslation("clans");
  const { isPending, data: session } = useSession();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {isPending ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <p className="font-medium text-site-text">{t("sign-in-prompt", { defaultValue: "Sign in to browse and join clans" })}</p>
            <Link to="/login" search={{ callbackURL: '/clans' }}>
              <Button variant="accent">{t("sign-in", { defaultValue: "Sign in" })}</Button>
            </Link>
          </div>
        ) : (
          <ClansColumn />
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
