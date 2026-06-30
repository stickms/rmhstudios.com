/**
 * Admin Users Route
 */

import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { PageLayout } from '@/components/feed/PageLayout';
import { ArrowLeft, Loader2, Search, CheckCircle, Shield, AlertCircle, Pencil, Check, X, Crown, Coins } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';

interface User {
  id: string;
  name: string;
  username: string;
  handle: string | null;
  email: string;
  image: string | null;
  isAdmin: boolean;
  isVerified: boolean;
  createdAt: string;
  profile: { coins: number } | null;
  _count: { userBuilds: number; rmharks: number };
}

export const Route = createFileRoute('/_site/admin/users')({
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [editingHandle, setEditingHandle] = useState<string | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [handleError, setHandleError] = useState<string | null>(null);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastUserElementRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) loadMore();
    });
    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore]);

  useEffect(() => {
    if (session && !(session.user as any).isAdmin) navigate({ to: '/' });
  }, [session, navigate]);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const url = search ? `/api/admin/users?q=${encodeURIComponent(search)}` : '/api/admin/users';
        const res = await fetch(url);
        if (res.ok) { const data = await res.json(); setUsers(data.items || []); setNextCursor(data.nextCursor); setHasMore(data.hasMore); }
      } catch (error) { console.error("Failed to fetch users", error); } finally { setLoading(false); }
    };
    const timeoutId = setTimeout(() => fetchUsers(), 500);
    return () => clearTimeout(timeoutId);
  }, [search]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const url = search ? `/api/admin/users?q=${encodeURIComponent(search)}&cursor=${nextCursor}` : `/api/admin/users?cursor=${nextCursor}`;
      const res = await fetch(url);
      if (res.ok) { const data = await res.json(); setUsers(prev => [...prev, ...(data.items || [])]); setNextCursor(data.nextCursor); setHasMore(data.hasMore); }
    } catch (error) { console.error("Failed to fetch more users", error); } finally { setLoadingMore(false); }
  };

  const toggleStatus = async (userId: string, field: 'isAdmin' | 'isVerified', currentValue: boolean) => {
    if (field === 'isAdmin' && !currentValue && !confirm(t("confirm-grant-admin", { defaultValue: "Are you sure you want to grant Admin privileges to this user? They will have full access to the database." }))) return;
    if (field === 'isAdmin' && currentValue && userId === session?.user?.id) { alert(t("alert-self-admin-remove", { defaultValue: "You cannot remove your own admin privileges from the dashboard." })); return; }
    setUpdating(userId);
    try {
      const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, [field]: !currentValue }) });
      if (res.ok) { const updated = await res.json(); setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u)); }
      else { const err = await res.text(); alert(t("alert-update-user-failed", { err, defaultValue: "Failed to update user: {{err}}" })); }
    } catch (error) { console.error("Failed to update user", error); alert(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  const grantMembership = async (userId: string) => {
    const choice = prompt(t("prompt-grant-membership", { defaultValue: 'Grant membership — enter "starter" or "pro" (or "revoke" to remove):' }), 'pro');
    if (!choice) return;
    const action = choice.trim().toLowerCase();
    let body: Record<string, unknown>;
    if (action === 'revoke') {
      body = { revoke: true };
    } else if (action === 'starter' || action === 'pro') {
      const monthsStr = prompt(t("prompt-how-many-months", { defaultValue: 'How many months?' }), '1');
      const months = Math.max(1, Math.min(24, parseInt(monthsStr || '1', 10) || 1));
      body = { tier: action, months };
    } else {
      alert(t("alert-invalid-membership-choice", { defaultValue: 'Enter "starter", "pro", or "revoke".' }));
      return;
    }
    setUpdating(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/grant-membership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) alert(action === 'revoke' ? t("alert-grants-revoked", { defaultValue: 'Active grants revoked.' }) : t("alert-membership-granted", { action, defaultValue: 'Granted {{action}}.' }));
      else { const d = await res.json().catch(() => ({})); alert(t("alert-membership-failed", { error: d.error || 'error', defaultValue: 'Failed: {{error}}' })); }
    } catch { alert(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  const setCoins = async (user: User) => {
    const current = user.profile?.coins ?? 0;
    const input = prompt(t("prompt-set-coins", { defaultValue: "Set RMH coin balance for this user:" }), String(current));
    if (input === null) return;
    const coins = parseInt(input.trim(), 10);
    if (!Number.isFinite(coins) || coins < 0) {
      alert(t("alert-invalid-coins", { defaultValue: "Enter a whole number of 0 or more." }));
      return;
    }
    setUpdating(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/set-coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coins }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, profile: { coins: data.coins } } : u));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(t("alert-set-coins-failed", { error: d.error || 'error', defaultValue: 'Failed: {{error}}' }));
      }
    } catch { alert(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  const startEditHandle = (user: User) => { setEditingHandle(user.id); setHandleInput(user.handle || ''); setHandleError(null); };
  const cancelEditHandle = () => { setEditingHandle(null); setHandleInput(''); setHandleError(null); };

  const saveHandle = async (userId: string) => {
    if (!handleInput.trim()) return;
    setUpdating(userId);
    setHandleError(null);
    try {
      const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, handle: handleInput.trim().toLowerCase() }) });
      if (res.ok) { const updated = await res.json(); setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u)); setEditingHandle(null); setHandleInput(''); }
      else { const data = await res.json().catch(() => ({})); setHandleError(data.error || t("error-update-handle", { defaultValue: 'Failed to update handle' })); }
    } catch { setHandleError(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  return (
    <PageLayout title={t("page-title", { defaultValue: "Manage Users" })} wide>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text-dim" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-site-text">{t("page-title", { defaultValue: "Manage Users" })}</h1>
            <p className="text-site-text-muted mt-1">{t("page-subtitle", { defaultValue: "Search users, verify accounts, and manage admin privileges." })}</p>
          </div>
        </div>

        <div className="bg-site-surface border border-site-border rounded-site overflow-hidden p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-site-text-dim" />
            <input type="text" placeholder={t("search-placeholder", { defaultValue: "Search by name, handle, or email..." })} value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-site-bg border border-site-border rounded-site-sm pl-10 pr-4 py-2.5 text-site-text focus:outline-none focus:border-site-accent/50 focus:ring-1 focus:ring-site-accent/50 transition-all placeholder:text-site-text-dim/50" />
          </div>
        </div>

        <div className="bg-site-surface border border-site-border rounded-site overflow-x-auto min-h-[400px]">
          {/* min-w keeps the header and rows column-aligned; the container scrolls
              horizontally on narrow screens instead of crushing the name column. */}
          <div className="min-w-[600px]">
          <div className="p-4 border-b border-site-border bg-site-bg/50">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs font-semibold text-site-text-dim uppercase tracking-wider">
              <div>{t("col-user", { defaultValue: "User" })}</div>
              <div className="w-20 text-center">{t("col-verified", { defaultValue: "Verified" })}</div>
              <div className="w-28 text-center">{t("col-actions", { defaultValue: "Actions" })}</div>
              <div className="w-24 text-right">{t("col-activity", { defaultValue: "Activity" })}</div>
            </div>
          </div>

          <div className="divide-y divide-site-border relative">
            {loading && (
              <div className="absolute inset-0 bg-site-surface/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-8">
                <Spinner size={32} className="mb-4" />
                <span className="text-site-text-muted">{t("loading-users", { defaultValue: "Loading users..." })}</span>
              </div>
            )}

            {!loading && users.length === 0 && (
              <div className="p-12 text-center text-site-text-muted flex flex-col items-center">
                <AlertCircle className="w-8 h-8 mb-3 text-site-text-dim" />
                <p>{t("no-users-found", { defaultValue: "No users found matching your search." })}</p>
              </div>
            )}

            {users.map((user, index) => {
              const isLast = index === users.length - 1;
              const isEditingThis = editingHandle === user.id;
              return (
                <div key={user.id} ref={isLast ? lastUserElementRef : null} className="p-4 flex items-center gap-4 hover:bg-site-surface-hover transition-colors">
                  <div className="flex-1 flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-site-bg overflow-hidden flex-shrink-0 border border-site-border">
                      {user.image ? (
                        <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-linear-to-br from-site-surface to-site-surface-hover flex items-center justify-center">
                          <span className="text-xs font-bold text-site-text-dim">{user.name?.charAt(0) || user.handle?.charAt(0) || 'U'}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link to={`/u/${user.handle || user.id}` as string} className="font-semibold text-site-text hover:text-site-accent truncate">{user.name || user.handle || user.username}</Link>
                        {user.isVerified && <CheckCircle className="w-3.5 h-3.5 text-site-accent shrink-0" />}
                        {user.isAdmin && <Shield className="w-3.5 h-3.5 text-site-danger shrink-0" />}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm text-site-text-dim">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-site-text-dim">@</span>
                            <input type="text" value={handleInput} onChange={(e) => setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="bg-site-bg border border-site-border rounded px-1.5 py-0.5 text-sm text-site-text w-32 focus:outline-none focus:border-site-accent" autoFocus maxLength={20} onKeyDown={(e) => { if (e.key === 'Enter') saveHandle(user.id); if (e.key === 'Escape') cancelEditHandle(); }} />
                            <button onClick={() => saveHandle(user.id)} className="p-0.5 text-site-success hover:text-site-success" disabled={updating === user.id}><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={cancelEditHandle} className="p-0.5 text-site-text-dim hover:text-site-text"><X className="w-3.5 h-3.5" /></button>
                            {handleError && <span className="text-xs text-site-danger">{handleError}</span>}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 truncate">
                            @{user.handle || '\u2014'}
                            {!user.isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); startEditHandle(user); }} className="p-0.5 text-site-text-dim hover:text-site-accent transition-colors" title={t("title-change-handle", { defaultValue: "Change handle" })}>
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        )}
                        <span className="hidden sm:inline">&bull;</span>
                        <span className="truncate">{user.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="w-20 flex-shrink-0 flex justify-center">
                    <button onClick={() => toggleStatus(user.id, 'isVerified', user.isVerified)} disabled={updating === user.id} className={`p-1.5 rounded-site-sm transition-colors border ${user.isVerified ? 'bg-site-accent/10 text-site-accent border-site-accent/20 hover:bg-site-accent/20' : 'bg-transparent text-site-text-dim border-site-border hover:border-site-text-muted'} ${updating === user.id ? 'opacity-50 cursor-not-allowed' : ''}`} title={user.isVerified ? t("title-remove-verification", { defaultValue: "Remove Verification" }) : t("title-verify-user", { defaultValue: "Verify User" })}>
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-28 flex-shrink-0 flex justify-center gap-1">
                    <button onClick={() => setCoins(user)} disabled={updating === user.id} className={`p-1.5 rounded-site-sm transition-colors border bg-transparent text-site-text-dim border-site-border hover:border-site-warning/40 hover:text-site-warning ${updating === user.id ? 'opacity-50 cursor-not-allowed' : ''}`} title={t("title-set-coins", { coins: user.profile?.coins ?? 0, defaultValue: "Set RMH coins (currently {{coins}})" })}>
                      <Coins className="w-4 h-4" />
                    </button>
                    <button onClick={() => grantMembership(user.id)} disabled={updating === user.id} className={`p-1.5 rounded-site-sm transition-colors border bg-transparent text-site-text-dim border-site-border hover:border-site-warning/40 hover:text-site-warning ${updating === user.id ? 'opacity-50 cursor-not-allowed' : ''}`} title={t("title-grant-revoke-membership", { defaultValue: "Grant / revoke membership" })}>
                      <Crown className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleStatus(user.id, 'isAdmin', user.isAdmin)} disabled={updating === user.id} className={`p-1.5 rounded-site-sm transition-colors border ${user.isAdmin ? 'bg-site-danger/10 text-site-danger border-site-danger/20 hover:bg-site-danger/20' : 'bg-transparent text-site-text-dim border-site-border hover:border-site-text-muted'} ${updating === user.id ? 'opacity-50 cursor-not-allowed' : ''}`} title={user.isAdmin ? t("title-remove-admin", { defaultValue: "Remove Admin" }) : t("title-make-admin", { defaultValue: "Make Admin" })}>
                      <Shield className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-24 flex-shrink-0 flex flex-col items-end text-xs text-site-text-dim">
                    <span>{t("user-builds", { count: user._count.userBuilds, defaultValue: "{{count}} builds" })}</span>
                    <span>{t("user-posts", { count: user._count.rmharks, defaultValue: "{{count}} posts" })}</span>
                    <span className="flex items-center gap-1 text-site-warning/80"><Coins className="w-3 h-3" />{(user.profile?.coins ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              )
            })}

            {loadingMore && (
              <div className="p-4 flex justify-center text-site-text-dim"><Loader2 className="w-6 h-6 animate-spin" /></div>
            )}
          </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
