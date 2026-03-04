'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Boxes, Plus, Edit, Trash2, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import type { Build } from '@/lib/user-builds-types';

function ManageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const editId = searchParams.get('edit');

  const fetchBuilds = useCallback(async () => {
    if (!session?.user?.id) return;

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
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchBuilds();
    }
  }, [fetchBuilds, session?.user?.id]);

  const handleDelete = async (build: Build) => {
    if (!confirm(`Delete "${build.title}"? This cannot be undone.`)) return;

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

  const handlePublish = async (build: Build) => {
    try {
      const res = await fetch(`/api/user-builds/${build.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PUBLISHED' }),
      });

      if (res.ok) {
        const updated = await res.json();
        setBuilds((prev) => prev.map((b) => (b.id === build.id ? { ...b, ...updated } : b)));
      }
    } catch (error) {
      console.error('Error publishing build:', error);
    }
  };

  const handleArchive = async (build: Build) => {
    try {
      const res = await fetch(`/api/user-builds/${build.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });

      if (res.ok) {
        const updated = await res.json();
        setBuilds((prev) => prev.map((b) => (b.id === build.id ? { ...b, ...updated } : b)));
      }
    } catch (error) {
      console.error('Error archiving build:', error);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen bg-site-bg pt-20 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-site-bg pt-20 pb-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="p-8 rounded-xl border border-site-border bg-site-surface">
            <Boxes className="w-12 h-12 text-violet-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-site-text mb-2">Sign In Required</h1>
            <p className="text-site-text-muted mb-6">
              You need to sign in to manage your builds.
            </p>
            <Link href="/login?redirect=/user-builds/manage">
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-site-text flex items-center gap-3 mb-2">
              <Boxes className="w-8 h-8 text-violet-400" />
              My Builds
            </h1>
            <p className="text-site-text-muted">Manage your published and draft builds</p>
          </div>

          <Link href="/user-builds/submit">
            <Button variant="accent" className="bg-violet-600 hover:bg-violet-500">
              <Plus className="w-4 h-4 mr-2" />
              New Build
            </Button>
          </Link>
        </div>

        {/* Builds List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : builds.length === 0 ? (
          <div className="text-center py-12 rounded-xl border border-site-border bg-site-surface">
            <Boxes className="w-12 h-12 text-site-text-dim mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-site-text mb-2">No builds yet</h2>
            <p className="text-site-text-muted mb-6">Create your first build and share it with the community.</p>
            <Link href="/user-builds/submit">
              <Button variant="accent" className="bg-violet-600 hover:bg-violet-500">
                <Plus className="w-4 h-4 mr-2" />
                Create Build
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {builds.map((build) => (
              <div
                key={build.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-site-border bg-site-surface"
              >
                {/* Thumbnail */}
                {build.thumbnailUrl ? (
                  <img
                    src={build.thumbnailUrl}
                    alt={build.title}
                    className="w-20 h-14 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-20 h-14 rounded bg-violet-500/20 flex items-center justify-center text-violet-400 text-lg font-bold shrink-0">
                    {build.title[0]?.toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link href={`/user-builds/${build.slug}`}>
                    <h3 className="font-semibold text-site-text hover:text-violet-400 transition-colors truncate">
                      {build.title}
                    </h3>
                  </Link>
                  <p className="text-sm text-site-text-muted truncate">{build.description}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-site-text-dim">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        build.status === 'PUBLISHED'
                          ? 'bg-green-500/20 text-green-400'
                          : build.status === 'DRAFT'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}
                    >
                      {build.status}
                    </span>
                    <span>{build.likeCount} likes</span>
                    <span>{build.viewCount} views</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link href={`/user-builds/${build.slug}`}>
                    <Button variant="ghost" size="icon" title="View">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Link href={`/user-builds/submit?edit=${build.id}`}>
                    <Button variant="ghost" size="icon" title="Edit">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </Link>
                  {build.status === 'DRAFT' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePublish(build)}
                      className="text-green-400 hover:text-green-300"
                    >
                      Publish
                    </Button>
                  )}
                  {build.status === 'PUBLISHED' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleArchive(build)}
                      title="Archive"
                    >
                      <EyeOff className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(build)}
                    disabled={deleting === build.id}
                    className="text-red-400 hover:text-red-300"
                    title="Delete"
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
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManageBuildsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-site-bg pt-20 pb-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    }>
      <ManageContent />
    </Suspense>
  );
}
