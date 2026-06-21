'use client';

import { useEffect, useState, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2, Users } from 'lucide-react';
import { RMHarkCard } from './RMHarkCard';
import { ComposeBox } from './ComposeBox';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { toast } from 'sonner';
import type { FeedItem } from '@/lib/feed-types';

interface CommunityData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  memberCount: number;
  joined: boolean;
  role: string | null;
}

export function CommunityColumn({ slug }: { slug: string }) {
  const { data: session } = useSession();
  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  const loadCommunity = useCallback(async () => {
    const res = await fetch(`/api/communities/${slug}`, { credentials: 'include' });
    if (res.ok) setCommunity(await res.json());
  }, [slug]);

  const loadFeed = useCallback(async () => {
    const res = await fetch(`/api/communities/${slug}/feed`, { credentials: 'include' });
    if (res.ok) setItems((await res.json()).items);
  }, [slug]);

  useEffect(() => {
    Promise.all([loadCommunity(), loadFeed()]).finally(() => setLoading(false));
  }, [loadCommunity, loadFeed]);

  const toggleJoin = async () => {
    if (!community) return;
    setJoining(true);
    try {
      const res = await fetch(`/api/communities/${slug}/join`, { method: 'POST', credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCommunity((c) => c && { ...c, joined: data.joined, memberCount: c.memberCount + (data.joined ? 1 : -1) });
      } else {
        toast.error(data.error || 'Could not update membership');
      }
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }
  if (!community) {
    return <p className="px-4 py-16 text-center text-sm text-site-text-muted">Community not found.</p>;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/communities" className="text-site-text-muted hover:text-site-text" aria-label="Back to communities">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-lg font-bold text-site-text">{community.name}</h1>
      </header>

      <div className="border-b border-site-border p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: (community.color || 'var(--site-accent)') + '22' }}
          >
            {community.icon || '👥'}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-site-text">{community.name}</h2>
            <p className="flex items-center gap-1 text-xs text-site-text-muted">
              <Users className="h-3 w-3" /> {community.memberCount} member{community.memberCount === 1 ? '' : 's'}
            </p>
          </div>
          {session && (
            <Button
              size="sm"
              variant={community.joined ? 'outline' : 'accent'}
              disabled={joining}
              onClick={toggleJoin}
            >
              {community.joined ? 'Joined' : 'Join'}
            </Button>
          )}
        </div>
        {community.description && <p className="mt-2 text-sm text-site-text-muted">{community.description}</p>}
      </div>

      {/* Composer for members */}
      {community.joined && <ComposeBox communityId={community.id} />}

      {items.length === 0 ? (
        <p className="px-4 py-16 text-center text-sm text-site-text-muted">No posts yet. Be the first!</p>
      ) : (
        <div className="divide-y divide-site-border">
          {items.map((item) => (
            <RMHarkCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
