'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Terminal } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { BuildForm } from '@/components/user-builds';
import { Button } from '@/components/ui/button';

export default function SubmitBuildPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  if (isPending) {
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
            <p className="text-site-text-muted mb-6">
              You need to sign in to submit a build.
            </p>
            <Link href="/login?redirect=/user-builds/submit">
              <Button variant="accent" className="w-full bg-violet-600 hover:bg-violet-500">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-site-bg pt-20 pb-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back link */}
        <Link
          href="/user-builds"
          className="inline-flex items-center gap-2 text-sm text-site-text-muted hover:text-site-text mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Builds
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-site-text mb-2">Submit a Build</h1>
          <p className="text-site-text-muted">
            Share your project with the community. You can save as a draft and publish later.
          </p>
        </div>

        {/* Form */}
        <div className="p-6 rounded-xl border border-site-border bg-site-surface">
          <BuildForm />
        </div>

        {/* CLI Tip */}
        <div className="mt-8 p-4 rounded-lg border border-site-border bg-site-surface">
          <h3 className="font-medium text-site-text mb-2">Prefer the CLI?</h3>
          <p className="text-sm text-site-text-muted mb-3">
            You can also publish builds directly from the terminal with rmhcode.
          </p>
          <code className="block p-3 rounded bg-site-bg border border-site-border text-sm font-mono text-violet-400">
            rmhcode push-build
          </code>
        </div>
      </div>
    </div>
  );
}
