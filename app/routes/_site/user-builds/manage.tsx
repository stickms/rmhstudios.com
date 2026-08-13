/**
 * Manage Builds Route
 */

import { createFileRoute, Link, useNavigate, useLocation } from '@tanstack/react-router';
import { useState, useEffect, Suspense } from 'react';
import { Boxes, Plus, Edit, Trash2, Eye, Loader2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import type { Build } from '@/lib/user-builds-types';
import { useTranslation } from 'react-i18next';
import { Reveal } from '@/components/motion';
import { LIFT_CARD } from '@/components/feed/motionHelpers';
import { PageLayout } from '@/components/feed/PageLayout';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';

export const Route = createFileRoute('/_site/user-builds/manage')({
  // `noindex`: one account's own builds (and `Disallow`ed in robots.txt).
  head: () => ({
    meta: [{ title: 'Manage builds | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  component: ManageBuildsPage,
});

function ManageContent() {
  const { t } = useTranslation('user-builds');
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending } = useSession();

  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      try {
        const res = await fetch(`/api/user-builds?userId=${session.user.id}`);
        if (res.ok) {
          const data = await res.json();
          setBuilds(data.items);
        }
      } catch (error) {
        console.error('Error fetching builds:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id]);

  const handleDelete = async (build: Build) => {
    if (
      !(await confirm({
        title: t('delete-confirm', {
          title: build.title,
          defaultValue: `Delete "{{title}}"? This cannot be undone.`,
        }),
        danger: true,
      }))
    )
      return;
    setDeleting(build.id);
    try {
      const res = await fetch(`/api/user-builds/${build.id}`, { method: 'DELETE' });
      if (res.ok) {
        setBuilds((prev) => prev.filter((b) => b.id !== build.id));
      }
    } catch (error) {
      console.error('Error deleting build:', error);
    } finally {
      setDeleting(null);
    }
  };

  if (isPending) {
    return (
      <PageLayout title={t('my-builds', { defaultValue: 'My Builds' })} backTo="/user-builds" wide>
        <div className="flex min-h-[40dvh] items-center justify-center">
          <Spinner size={32} />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={t('my-builds', { defaultValue: 'My Builds' })} backTo="/user-builds" wide>
        <SignedOutPrompt
          icon={Boxes}
          callbackURL="/user-builds/manage"
          title={t('sign-in-required', { defaultValue: 'Sign In Required' })}
          description={t('sign-in-to-manage', {
            defaultValue: 'You need to sign in to manage your builds.',
          })}
          actionLabel={t('sign-in', { defaultValue: 'Sign In' })}
        />
      </PageLayout>
    );
  }

  return (
    // The hand-rolled `<h1>` + subtitle + action row becomes the frame's own
    // title/description/headerRight, so this page's header is the same object as
    // every other route's instead of a lookalike at a different size.
    <PageLayout
      title={t('my-builds', { defaultValue: 'My Builds' })}
      description={t('manage-subtitle', { defaultValue: 'Manage your published and draft builds' })}
      backTo="/user-builds"
      wide
      headerRight={
        <Link to="/user-builds/submit">
          <Button variant="accent">
            <Plus className="w-4 h-4" /> {t('new-build', { defaultValue: 'New Build' })}
          </Button>
        </Link>
      }
    >

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size={32} />
          </div>
        ) : builds.length === 0 ? (
          <Reveal className="text-center py-12 rounded-site border border-site-border bg-site-surface">
            <Boxes className="w-12 h-12 text-site-text-dim mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-site-text mb-2">
              {t('no-builds-yet', { defaultValue: 'No builds yet' })}
            </h2>
            <p className="text-site-text-muted mb-6">
              {t('no-builds-description', {
                defaultValue: 'Create your first build and share it with the community.',
              })}
            </p>
            <Link to="/user-builds/submit">
              <Button variant="accent" className="bg-site-accent hover:bg-site-accent">
                <Plus className="w-4 h-4 mr-2" />{' '}
                {t('create-build', { defaultValue: 'Create Build' })}
              </Button>
            </Link>
          </Reveal>
        ) : (
          <Reveal className="space-y-4">
            {builds.map((build) => (
              <div
                key={build.id}
                className={`flex items-center gap-4 p-4 rounded-site border border-site-border bg-site-surface ${LIFT_CARD}`}
              >
                {build.thumbnailUrl ? (
                  <img
                    src={build.thumbnailUrl}
                    alt={build.title}
                    className="w-20 h-14 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-20 h-14 rounded bg-site-accent/20 flex items-center justify-center text-site-accent text-lg font-bold shrink-0">
                    {build.title[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link to={`/user-builds/${build.slug}` as string}>
                    <h3 className="font-semibold text-site-text hover:text-site-accent transition-colors truncate">
                      {build.title}
                    </h3>
                  </Link>
                  <p className="text-sm text-site-text-muted truncate">{build.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-site-text-dim">
                    <span
                      className={`px-2 py-0.5 rounded ${build.visibility === 'PUBLIC' ? 'bg-site-success/20 text-site-success' : build.visibility === 'UNLISTED' ? 'bg-site-warning/20 text-site-warning' : 'bg-site-surface text-site-text-muted'}`}
                    >
                      {build.visibility}
                    </span>
                    <span>
                      {t('like-count', { count: build.likeCount, defaultValue: '{{count}} likes' })}
                    </span>
                    <span>
                      {t('view-count', { count: build.viewCount, defaultValue: '{{count}} views' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link to={`/user-builds/${build.slug}` as string}>
                    <Button variant="ghost" size="icon" title={t('view', { defaultValue: 'View' })}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link to="/user-builds/submit" search={{ edit: build.id }}>
                    <Button variant="ghost" size="icon" title={t('edit', { defaultValue: 'Edit' })}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(build)}
                    disabled={deleting === build.id}
                    className="text-site-danger hover:text-site-danger"
                    title={t('delete', { defaultValue: 'Delete' })}
                  >
                    {deleting === build.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </Reveal>
        )}
    </PageLayout>
  );
}

function ManageBuildsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60dvh] items-center justify-center">
          <Spinner size={32} />
        </div>
      }
    >
      <ManageContent />
    </Suspense>
  );
}
