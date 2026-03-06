/**
 * Submit Build Route
 */

import { createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router';
import { Suspense, useState, useEffect } from 'react';
import { ArrowLeft, Terminal, AlertCircle } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { BuildForm } from '@/components/user-builds';
import { Button } from '@/components/ui/button';
import type { Build } from '@/lib/user-builds-types';

export const Route = createFileRoute('/_site/user-builds/submit')({
  component: SubmitBuildPage,
});

function SubmitBuildContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const editId = searchParams.get('edit');
  const { data: session, isPending } = useSession();

  const [build, setBuild] = useState<Build | null>(null);
  const [loadingBuild, setLoadingBuild] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!editId || !session) return;
    setLoadingBuild(true);
    setFetchError(null);
    fetch(`/api/user-builds/${editId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Build not found');
        return res.json();
      })
      .then((data) => {
        if (!data.isOwner) throw new Error('You do not have permission to edit this build');
        setBuild(data);
      })
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoadingBuild(false));
  }, [editId, session]);

  if (isPending || loadingBuild || (editId && !build && !fetchError)) {
    return (
      <div className="min-h-screen bg-site-bg pt-20 pb-12 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-site-bg pt-20 pb-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="p-8 rounded-xl border border-site-border bg-site-surface">
            <Terminal className="w-12 h-12 text-violet-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-site-text mb-2">Sign In Required</h1>
            <p className="text-site-text-muted mb-6">You need to sign in to submit a build.</p>
            <Link to="/login" search={{ callbackURL: '/user-builds/submit' }}>
              <Button variant="accent" className="w-full bg-violet-600 hover:bg-violet-500">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-site-bg pt-20 pb-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="p-8 rounded-xl border border-site-border bg-site-surface">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-site-text mb-2">Error Loading Build</h1>
            <p className="text-site-text-muted mb-6">{fetchError}</p>
            <Link to="/user-builds/manage">
              <Button variant="secondary">Back to My Builds</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isEditing = !!build;

  return (
    <div className="min-h-screen bg-site-bg pt-20 pb-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to={isEditing ? '/user-builds/manage' : '/user-builds'}
          className="inline-flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isEditing ? 'Back to My Builds' : 'Back to Builds'}
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-site-text mb-2">{isEditing ? 'Edit Build' : 'Submit a Build'}</h1>
          <p className="text-site-text-muted">
            {isEditing ? 'Update your build details below.' : 'Share your project with the community. You can save as a draft and publish later.'}
          </p>
        </div>

        <div className="p-6 rounded-xl border border-site-border bg-site-surface">
          <BuildForm key={build?.id} build={build ?? undefined} />
        </div>

        {!isEditing && (
          <div className="mt-8 p-4 rounded-lg border border-site-border bg-site-surface">
            <h3 className="font-medium text-site-text mb-2">Prefer the CLI?</h3>
            <p className="text-sm text-site-text-muted mb-3">You can also publish builds directly from the terminal with rmhcode.</p>
            <code className="block p-3 rounded bg-site-bg border border-site-border text-sm font-mono text-violet-400">rmhcode push-build</code>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmitBuildPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-site-bg pt-20 pb-12 flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" /></div>}>
      <SubmitBuildContent />
    </Suspense>
  );
}
