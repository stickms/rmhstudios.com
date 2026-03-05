'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, UserPlus } from 'lucide-react';
import { useSession } from '@/components/Providers';

interface SidebarUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

function UserRow({ user }: { user: SidebarUser }) {
  return (
    <Link
      href={`/@${(user as any).handle || user.id}`}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
    >
      <div className="w-8 h-8 rounded-full bg-linear-to-tr from-site-accent to-site-accent-hover flex items-center justify-center text-white font-bold text-xs shrink-0">
        {user.image ? (
          <img src={user.image} alt={user.name || 'User'} className="w-full h-full rounded-full object-cover" />
        ) : (
          (user.name?.[0] || 'U').toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
          {user.name || 'Unknown'}
        </p>
        {user.username && (
          <p className="text-xs text-site-text-dim truncate">@{user.username}</p>
        )}
      </div>
    </Link>
  );
}

export function MessagesRightSidebar() {
  const { data: session } = useSession();
  const [recent, setRecent] = useState<SidebarUser[]>([]);
  const [suggested, setSuggested] = useState<SidebarUser[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch('/api/messages/sidebar')
      .then((res) => res.json())
      .then((data) => {
        setRecent(data.recent ?? []);
        setSuggested(data.suggested ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [session]);

  if (!session) return null;

  return (
    <div className="p-4 space-y-6">
      {/* Previously Messaged */}
      {loaded && recent.length > 0 && (
        <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
          <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
            <MessageCircle className="w-5 h-5 text-site-accent" />
            Recently Messaged
          </h2>
          <div className="space-y-1">
            {recent.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </div>
        </section>
      )}

      {/* Suggested Users */}
      {loaded && suggested.length > 0 && (
        <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
          <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
            <UserPlus className="w-5 h-5 text-site-accent" />
            Start a Conversation
          </h2>
          <p className="text-xs text-site-text-dim mb-3">People you follow</p>
          <div className="space-y-1">
            {suggested.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {loaded && recent.length === 0 && suggested.length === 0 && (
        <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
          <p className="text-sm text-site-text-muted text-center py-4">
            Visit someone&apos;s profile to start a conversation.
          </p>
        </section>
      )}

      {/* Footer */}
      <div className="text-xs text-site-text-dim px-2 space-y-1">
        <p>RMH | The Everything Platform</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <Link href="/blog" className="hover:text-site-text transition-colors">Blog</Link>
          <Link href="/roadmap" className="hover:text-site-text transition-colors">Roadmap</Link>
          <Link href="/research" className="hover:text-site-text transition-colors">Research</Link>
        </div>
      </div>
    </div>
  );
}
