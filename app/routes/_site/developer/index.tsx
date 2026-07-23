import { createFileRoute, Link } from '@tanstack/react-router';
import { Terminal, BookOpen } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { KeysManager } from '@/components/developer/KeysManager';
import { PageLayout } from '@/components/feed/PageLayout';

export const Route = createFileRoute('/_site/developer/')({
  head: () => ({ meta: [{ title: 'Developer API | RMH Studios' }] }),
  component: DeveloperHome,
});

function DeveloperHome() {
  const { data: session, isPending } = useSession();

  return (
    <PageLayout
      title="Developer API"
      wide
      headerRight={
        <Link to="/developer/docs/$page" params={{ page: 'overview' }}>
          <Button variant="ghost" size="sm" className="gap-1">
            <BookOpen className="h-4 w-4" /> Docs
          </Button>
        </Link>
      }
    >
      <div className="space-y-6 px-4 pb-[var(--site-page-bottom-space)]">
        <section>
          <p className="flex items-start gap-2 text-sm leading-relaxed text-site-text-muted">
            <Terminal className="mt-0.5 h-5 w-5 shrink-0 text-site-accent" aria-hidden />
            <span>
              Build on RMH Studios programmatically. The REST API is available to{' '}
              <strong className="text-site-text">Starter subscribers and above</strong>. Create a
              scoped key below, then read the{' '}
              <Link
                to="/developer/docs/$page"
                params={{ page: 'overview' }}
                className="text-site-accent hover:underline"
              >
                documentation
              </Link>{' '}
              or point your codegen at the{' '}
              <a href="/api/v1/openapi.json" className="text-site-accent hover:underline">
                OpenAPI spec
              </a>
              .
            </span>
          </p>
        </section>

        {isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="font-medium text-site-text">Sign in to manage developer keys</p>
            <Link to="/login" search={{ callbackURL: '/developer' }}>
              <Button variant="accent">Sign in</Button>
            </Link>
          </div>
        ) : (
          <KeysManager />
        )}
      </div>
    </PageLayout>
  );
}
