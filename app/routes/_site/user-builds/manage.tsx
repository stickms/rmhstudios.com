/**
 * Manage Builds Route
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect, Suspense } from 'react';
import { Boxes, Plus, Edit, Trash2, Eye } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
        <Button asChild variant="accent">
          <Link to="/user-builds/submit">
            <Plus aria-hidden /> {t('new-build', { defaultValue: 'New Build' })}
          </Link>
        </Button>
      }
    >
      <div className="px-4 pt-4 pb-12">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner size={32} />
          </div>
        ) : builds.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={t('no-builds-yet', { defaultValue: 'No builds yet' })}
            description={t('no-builds-description', {
              defaultValue: 'Create your first build and share it with the community.',
            })}
            action={
              <Button asChild variant="accent">
                <Link to="/user-builds/submit">
                  <Plus aria-hidden /> {t('create-build', { defaultValue: 'Create Build' })}
                </Link>
              </Button>
            }
          />
        ) : (
          <Reveal className="space-y-3">
            {builds.map((build) => (
              <div
                key={build.id}
                className={`flex items-center gap-3 rounded-site px-4 py-3 glass-fill ${LIFT_CARD}`}
              >
                {build.thumbnailUrl ? (
                  <img
                    src={build.thumbnailUrl}
                    alt={build.title}
                    className="h-14 w-20 shrink-0 rounded-site-sm object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-site-sm bg-site-accent-dim text-lg font-bold text-site-accent">
                    {build.title[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Link to={`/user-builds/${build.slug}` as string}>
                    <h3 className="truncate font-semibold text-site-text transition-colors hover:text-site-accent">
                      {build.title}
                    </h3>
                  </Link>
                  <p className="truncate text-sm text-site-text-muted">{build.description}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-site-text-dim">
                    <Badge
                      size="sm"
                      variant={
                        build.visibility === 'PUBLIC'
                          ? 'success'
                          : build.visibility === 'UNLISTED'
                            ? 'warning'
                            : 'default'
                      }
                      icon={false}
                    >
                      {build.visibility}
                    </Badge>
                    <span>
                      {t('like-count', { count: build.likeCount, defaultValue: '{{count}} likes' })}
                    </span>
                    <span>
                      {t('view-count', { count: build.viewCount, defaultValue: '{{count}} views' })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      to={`/user-builds/${build.slug}` as string}
                      aria-label={t('view', { defaultValue: 'View' })}
                      title={t('view', { defaultValue: 'View' })}
                    >
                      <Eye aria-hidden />
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="icon">
                    <Link
                      to="/user-builds/submit"
                      search={{ edit: build.id }}
                      aria-label={t('edit', { defaultValue: 'Edit' })}
                      title={t('edit', { defaultValue: 'Edit' })}
                    >
                      <Edit aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(build)}
                    loading={deleting === build.id}
                    loadingText={<></>}
                    className="text-site-danger hover:text-site-danger"
                    aria-label={t('delete', { defaultValue: 'Delete' })}
                    title={t('delete', { defaultValue: 'Delete' })}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </Reveal>
        )}
      </div>
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
