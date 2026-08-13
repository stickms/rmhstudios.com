/**
 * Submit Build Route
 */

import { createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router';
import { Suspense, useState, useEffect } from 'react';
import { Terminal, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { BuildForm } from '@/components/user-builds';
import { Button } from '@/components/ui/button';
import type { Build } from '@/lib/user-builds-types';
import { Reveal } from '@/components/motion';
import { PageLayout } from '@/components/feed/PageLayout';
import { Spinner } from '@/components/ui/spinner';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { EmptyState } from '@/components/ui/empty-state';

export const Route = createFileRoute('/_site/user-builds/submit')({
  // `noindex`: an authoring form, and `Disallow`ed in robots.txt.
  head: () => ({
    meta: [{ title: 'Submit a build | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: SubmitBuildPage,
});

function SubmitBuildContent() {
  const { t } = useTranslation("user-builds");
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.searchStr);
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
      <PageLayout title={t("submit-a-build", { defaultValue: "Submit a Build" })} backTo="/user-builds" wide>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <Spinner />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={t("submit-a-build", { defaultValue: "Submit a Build" })} backTo="/user-builds" wide>
        <SignedOutPrompt
          icon={Terminal}
          callbackURL="/user-builds/submit"
          title={t("sign-in-required", { defaultValue: "Sign In Required" })}
          description={t("sign-in-to-submit", { defaultValue: "You need to sign in to submit a build." })}
          actionLabel={t("sign-in", { defaultValue: "Sign In" })}
        />
      </PageLayout>
    );
  }

  if (fetchError) {
    return (
      <PageLayout title={t("submit-a-build", { defaultValue: "Submit a Build" })} backTo="/user-builds" wide>
        <EmptyState
          icon={AlertCircle}
          title={t("error-loading-build", { defaultValue: "Error Loading Build" })}
          description={fetchError}
          action={
            <Link to="/user-builds/manage">
              <Button variant="secondary">{t("back-to-my-builds", { defaultValue: "Back to My Builds" })}</Button>
            </Link>
          }
        />
      </PageLayout>
    );
  }

  const isEditing = !!build;

  // `PageLayout`, like every other route under `_site`. This used to be a
  // hand-rolled `min-h-screen bg-site-bg pt-20 pb-12` root with its own `<h1>`
  // and its own back link — which meant an OPAQUE slab painted over the shell's
  // ring backdrop, a second full viewport of dead scroll under a shell that
  // already guarantees one, no `pb-dock` (so the last row sat under the floating
  // chrome), and no page-enter animation. Four things the frame does for free.
  return (
    <PageLayout
      title={isEditing ? t("edit-build", { defaultValue: "Edit Build" }) : t("submit-a-build", { defaultValue: "Submit a Build" })}
      description={isEditing ? t("update-build-details", { defaultValue: "Update your build details below." }) : t("share-project-with-community", { defaultValue: "Share your project with the community." })}
      backTo={isEditing ? '/user-builds/manage' : '/user-builds'}
      backLabel={isEditing ? t("back-to-my-builds", { defaultValue: "Back to My Builds" }) : t("back-to-builds", { defaultValue: "Back to Builds" })}
      wide
    >
      <Reveal className="glass-pane rounded-site p-6">
        <BuildForm key={build?.id} build={build ?? undefined} />
      </Reveal>

      {!isEditing && (
        <div className="glass-fill mt-8 rounded-site-sm p-4">
          <h3 className="font-medium text-site-text mb-2">{t("prefer-the-cli", { defaultValue: "Prefer the CLI?" })}</h3>
          <p className="text-sm text-site-text-muted mb-3">{t("cli-description", { defaultValue: "You can also publish builds directly from the terminal with rmhcode." })}</p>
          <code className="glass-inset block rounded-site-sm p-3 text-sm font-mono text-site-accent">rmhcode push-build</code>
        </div>
      )}
    </PageLayout>
  );
}

function SubmitBuildPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60dvh] items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <SubmitBuildContent />
    </Suspense>
  );
}
