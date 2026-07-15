import { createFileRoute, Link } from '@tanstack/react-router';
import { Terminal, BookOpen } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { KeysManager } from '@/components/developer/KeysManager';

export const Route = createFileRoute('/_site/developer/')({
  head: () => ({ meta: [{ title: 'Developer API | RMH Studios' }] }),
  component: DeveloperHome,
});

function DeveloperHome() {
  const { data: session, isPending } = useSession();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-site-border glass-chrome px-4 py-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-site-accent" />
          <h1 className="text-lg font-bold text-site-text">Developer API</h1>
        </div>
        <Link to="/developer/docs/$page" params={{ page: 'overview' }}>
          <Button variant="ghost" size="sm" className="gap-1"><BookOpen className="h-4 w-4" /> Docs</Button>
        </Link>
      </header>

      <div className="space-y-6 p-4">
        <section>
          <p className="text-sm text-site-text-muted">
            Build on RMH Studios programmatically. The REST API is available to{' '}
            <strong className="text-site-text">Starter subscribers and above</strong>. Create a scoped key below, then
            read the <Link to="/developer/docs/$page" params={{ page: 'overview' }} className="text-site-accent hover:underline">documentation</Link>{' '}
            or point your codegen at the <a href="/api/v1/openapi.json" className="text-site-accent hover:underline">OpenAPI spec</a>.
          </p>
        </section>

        {isPending ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : !session ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="font-medium text-site-text">Sign in to manage developer keys</p>
            <Link to="/login" search={{ callbackURL: '/developer' }}><Button variant="accent">Sign in</Button></Link>
          </div>
        ) : (
          <KeysManager />
        )}
      </div>
    </div>
  );
}
