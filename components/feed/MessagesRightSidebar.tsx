'use client';

import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MessageCircle, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useSession } from '@/components/Providers';

interface SidebarUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

function UserRow({ user }: { user: SidebarUser }) {
  const { t } = useTranslation("feed");
  return (
    <Link
      to={`/u/${(user as any).handle || user.id}` as string}
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
    >
      <UserAvatar src={user.image ?? undefined} alt={user.name || t("user-alt", { defaultValue: "User" })} size={32} fallbackName={user.name ?? undefined} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
          {user.name || t("unknown-user", { defaultValue: "Unknown" })}
        </p>
        {user.username && (
          <p className="text-xs text-site-text-dim truncate">@{user.username}</p>
        )}
      </div>
    </Link>
  );
}

export function MessagesRightSidebar() {
  const { t } = useTranslation("feed");
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
            {t("recently-messaged", { defaultValue: "Recently Messaged" })}
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
            {t("start-a-conversation", { defaultValue: "Start a Conversation" })}
          </h2>
          <p className="text-xs text-site-text-dim mb-3">{t("people-you-follow", { defaultValue: "People you follow" })}</p>
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
            {t("visit-profile-to-start", { defaultValue: "Visit someone's profile to start a conversation." })}
          </p>
        </section>
      )}

      {/* Footer */}
      <div className="text-xs text-site-text-dim px-2 space-y-1">
        <p>RMH | The Everything Platform</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          <Link to="/blog" className="hover:text-site-text transition-colors">{t("nav-blog", { defaultValue: "Blog" })}</Link>
          <Link to="/roadmap" className="hover:text-site-text transition-colors">{t("nav-roadmap", { defaultValue: "Roadmap" })}</Link>
          <Link to="/research" className="hover:text-site-text transition-colors">{t("nav-research", { defaultValue: "Research" })}</Link>
        </div>
      </div>
    </div>
  );
}
