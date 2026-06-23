import { createFileRoute, Link } from '@tanstack/react-router';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { JourneyColumn } from '@/components/feed/JourneyColumn';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/_site/progress')({
  head: () => ({ meta: [{ title: 'Progress | RMH Studios' }] }),
  component: ProgressPage,
});

function ProgressPage() {
  const { data: session, isPending } = useSession();

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
            <p className="font-medium text-site-text">Sign in to track your progress</p>
            <Link to="/login" search={{ callbackURL: '/progress' }}>
              <Button variant="accent">Sign in</Button>
            </Link>
          </div>
        ) : (
          <JourneyColumn userId={session.user.id} initialTab="progress" />
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
