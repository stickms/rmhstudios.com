/**
 * Admin Users Route
 */

import { AdminBody } from '@/components/admin/AdminBody';
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '@/lib/toast';
import { PageLayout } from '@/components/feed/PageLayout';
import { Search, CheckCircle, Shield, Pencil, Check, X, Crown, Coins, Bot, User as UserIcon, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import { Badge } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/icon-button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { PageTabs } from '@/components/feed/PageTabs';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/Providers';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import {
  grantAdminMembershipApi,
  setAdminUserCoinsApi,
  updateAdminUserApi,
} from '@/lib/admin/admin-ops.contract';
import { useArrival, useArrivingKeys, ARRIVE } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

type AccountFilter = 'all' | 'people' | 'bots';

interface User {
  id: string;
  name: string;
  username: string;
  handle: string | null;
  /** Null for bot accounts — the bot-worker inserts them without one. */
  email: string | null;
  image: string | null;
  isAdmin: boolean;
  isVerified: boolean;
  isBot: boolean;
  createdAt: string;
  profile: { coins: number } | null;
  _count: { userBuilds: number; rmharks: number };
}

export const Route = createFileRoute('/_site/admin/users')({
  head: () => ({ meta: [{ title: 'Users | Admin | RMH Studios' }] }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const confirm = useConfirm();
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
  // Bot accounts are ordinary user rows, so they're impossible to pick out of a
  // flat list — this narrows the table to one population or the other.
  const [accounts, setAccounts] = useState<AccountFilter>('all');
  const arrival = useArrival(!(loading && users.length === 0));
  const isNewUser = useArrivingKeys(users.map((u) => u.id));

  const listUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (accounts !== 'all') params.set('accounts', accounts);
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    return qs ? `/api/admin/users?${qs}` : '/api/admin/users';
  }, [search, accounts]);

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

  // Bumped whenever the query (search / account filter) changes: a first page
  // or a "load more" page that answers an older query is dropped, never
  // appended to the new query's rows.
  const queryGen = useRef(0);
  useEffect(() => {
    const gen = ++queryGen.current;
    const abort = new AbortController();
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const res = await fetch(listUrl(), { signal: abort.signal });
        if (gen !== queryGen.current) return;
        if (res.ok) { const data = await res.json(); if (gen !== queryGen.current) return; setUsers(data.items || []); setNextCursor(data.nextCursor); setHasMore(data.hasMore); }
      } catch (error) { if (!abort.signal.aborted) console.error("Failed to fetch users", error); } finally { if (gen === queryGen.current) setLoading(false); }
    };
    const timeoutId = setTimeout(() => fetchUsers(), 500);
    return () => { clearTimeout(timeoutId); abort.abort(); };
  }, [listUrl]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || loading) return;
    const gen = queryGen.current;
    setLoadingMore(true);
    try {
      const res = await fetch(listUrl(nextCursor));
      if (gen !== queryGen.current) return;
      if (res.ok) { const data = await res.json(); if (gen !== queryGen.current) return; setUsers(prev => [...prev, ...(data.items || [])]); setNextCursor(data.nextCursor); setHasMore(data.hasMore); }
    } catch (error) { console.error("Failed to fetch more users", error); } finally { setLoadingMore(false); }
  };

  const toggleStatus = async (userId: string, field: 'isAdmin' | 'isVerified', currentValue: boolean) => {
    if (field === 'isAdmin' && !currentValue && !(await confirm({ title: t("confirm-grant-admin", { defaultValue: "Are you sure you want to grant Admin privileges to this user? They will have full access to the database." }), danger: true }))) return;
    if (field === 'isAdmin' && currentValue && userId === session?.user?.id) { toast.error(t("alert-self-admin-remove", { defaultValue: "You cannot remove your own admin privileges from the dashboard." })); return; }
    if (updating !== null) return;
    setUpdating(userId);
    try {
      const updated = await api(updateAdminUserApi, { body: { userId, [field]: !currentValue } });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
    } catch (error) {
      if (error instanceof HttpError) { const err = error.text ?? serverError(error) ?? ''; toast.error(t("alert-update-user-failed", { err, defaultValue: "Failed to update user: {{err}}" })); }
      else { console.error("Failed to update user", error); toast.error(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); }
    } finally { setUpdating(null); }
  };

  const grantMembership = async (userId: string) => {
    const choice = prompt(t("prompt-grant-membership", { defaultValue: 'Grant membership — enter "starter" or "pro" (or "revoke" to remove):' }), 'pro');
    if (!choice) return;
    const action = choice.trim().toLowerCase();
    let body: { revoke: true } | { tier: 'starter' | 'pro'; months: number };
    if (action === 'revoke') {
      body = { revoke: true };
    } else if (action === 'starter' || action === 'pro') {
      const monthsStr = prompt(t("prompt-how-many-months", { defaultValue: 'How many months?' }), '1');
      const months = Math.max(1, Math.min(24, parseInt(monthsStr || '1', 10) || 1));
      body = { tier: action, months };
    } else {
      toast.error(t("alert-invalid-membership-choice", { defaultValue: 'Enter "starter", "pro", or "revoke".' }));
      return;
    }
    if (updating !== null) return;
    setUpdating(userId);
    try {
      try {
        await api(grantAdminMembershipApi, { params: { id: userId }, body });
        toast.success(action === 'revoke' ? t("alert-grants-revoked", { defaultValue: 'Active grants revoked.' }) : t("alert-membership-granted", { action, defaultValue: 'Granted {{action}}.' }));
      } catch (e) {
        // An HTTP refusal reports the server's message; anything else is "can't connect".
        if (e instanceof HttpError) toast.error(t("alert-membership-failed", { error: serverError(e) || 'error', defaultValue: 'Failed: {{error}}' }));
        else throw e;
      }
    } catch { toast.error(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  const setCoins = async (user: User) => {
    const current = user.profile?.coins ?? 0;
    const input = prompt(t("prompt-set-coins", { defaultValue: "Set RMH coin balance for this user:" }), String(current));
    if (input === null) return;
    const coins = parseInt(input.trim(), 10);
    if (!Number.isFinite(coins) || coins < 0) {
      toast.error(t("alert-invalid-coins", { defaultValue: "Enter a whole number of 0 or more." }));
      return;
    }
    if (updating !== null) return;
    setUpdating(user.id);
    try {
      try {
        const data = await api(setAdminUserCoinsApi, { params: { id: user.id }, body: { coins } });
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, profile: { coins: data.coins } } : u));
        toast.success(t("alert-coins-updated", { defaultValue: "Coin balance updated." }));
      } catch (e) {
        if (e instanceof HttpError) toast.error(t("alert-set-coins-failed", { error: serverError(e) || 'error', defaultValue: 'Failed: {{error}}' }));
        else throw e;
      }
    } catch { toast.error(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  const startEditHandle = (user: User) => { setEditingHandle(user.id); setHandleInput(user.handle || ''); setHandleError(null); };
  const cancelEditHandle = () => { setEditingHandle(null); setHandleInput(''); setHandleError(null); };

  const saveHandle = async (userId: string) => {
    if (!handleInput.trim()) return;
    if (updating !== null) return;
    setUpdating(userId);
    setHandleError(null);
    try {
      try {
        const updated = await api(updateAdminUserApi, { body: { userId, handle: handleInput.trim().toLowerCase() } });
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u)); setEditingHandle(null); setHandleInput('');
      } catch (e) {
        if (e instanceof HttpError) setHandleError(serverError(e) || t("error-update-handle", { defaultValue: 'Failed to update handle' }));
        else throw e;
      }
    } catch { setHandleError(t("alert-connect-failed", { defaultValue: "Failed to connect to server." })); } finally { setUpdating(null); }
  };

  // One `updating` slot for the whole table: while any row's write is in
  // flight every row's actions are disabled, so a second write can't start and
  // then have the first one's `finally` clear its busy state.
  const busyOf = (_id: string) => updating !== null;

  return (
    <PageLayout
      title={t("page-title", { defaultValue: "Manage Users" })}
      description={t("page-subtitle", { defaultValue: "Search users, verify accounts, and manage admin privileges." })}
      wide
      backTo="/admin"
      backLabel={t("back-to-admin", { defaultValue: "Back to admin" })}
    >
      <PageTabs
        aria-label={t("filter-accounts", { defaultValue: "Filter accounts" })}
        value={accounts}
        onChange={(id) => setAccounts(id as AccountFilter)}
        tabs={[
          { id: 'all', label: t("filter-all", { defaultValue: "All" }), icon: Users },
          { id: 'people', label: t("filter-people", { defaultValue: "People" }), icon: UserIcon },
          { id: 'bots', label: t("filter-bots", { defaultValue: "Bots" }), icon: Bot },
        ]}
      />
      <AdminBody width="wide">
        <SearchField
          value={search}
          onValueChange={setSearch}
          placeholder={t("search-placeholder", { defaultValue: "Search by name, handle, or email..." })}
          aria-label={t("search-label", { defaultValue: "Search users" })}
        />

        <div>
          {/* From `sm` this is a 4-column table; below `sm` each row is two
              lines (who, then the counts and the actions), so there is no
              column header and no min-width that would hide most of a row
              behind a sideways swipe. */}
          <div className="hidden border-b border-site-border py-2 sm:block">
            <div className="t-label grid grid-cols-[1fr_auto_auto_auto] gap-4">
              <div>{t("col-user", { defaultValue: "User" })}</div>
              <div className="w-20 text-center">{t("col-verified", { defaultValue: "Verified" })}</div>
              <div className="w-32 text-center">{t("col-actions", { defaultValue: "Actions" })}</div>
              <div className="w-24 text-end">{t("col-activity", { defaultValue: "Activity" })}</div>
            </div>
          </div>

          {loading && users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-site-text-muted">
              <Spinner />
              <span>{t("loading-users", { defaultValue: "Loading users..." })}</span>
            </div>
          ) : !loading && users.length === 0 ? (
            <EmptyState className={arrival} icon={Search} title={t("no-users-found", { defaultValue: "No users found matching your search." })} />
          ) : (
            <div
              className={cn('divide-y divide-site-border transition-opacity duration-site-fast', loading && 'opacity-60', arrival)}
              aria-busy={loading}
            >
              {users.map((user, index) => {
                const isLast = index === users.length - 1;
                const isEditingThis = editingHandle === user.id;
                const busy = busyOf(user.id);
                // Bot accounts are inserted by the bot-worker without an email,
                // so the secondary line would otherwise trail a lone bullet.
                const secondaryLine =
                  user.email ?? (user.isBot ? t("bot-no-email", { defaultValue: "Automated account" }) : null);
                return (
                  <div key={user.id} ref={isLast ? lastUserElementRef : null} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 py-3', isNewUser(user.id) && ARRIVE)}>
                    <div className="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-0">
                      <UserAvatar src={user.image} alt={user.name || user.handle || user.username} size={40} fallbackName={user.name || user.handle || 'U'} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link to={`/u/${user.handle || user.id}` as string} className="t-body truncate font-semibold text-site-text hover:underline">{user.name || user.handle || user.username}</Link>
                          {user.isVerified && <CheckCircle className="size-4 shrink-0 text-site-accent" role="img" aria-label={t("title-verified", { defaultValue: "Verified" })} />}
                          {user.isAdmin && <Shield className="size-4 shrink-0 text-site-danger" role="img" aria-label={t("title-admin", { defaultValue: "Admin" })} />}
                          {user.isBot && (
                            <Badge variant="default" icon={<Bot aria-hidden />}>
                              {t("badge-bot", { defaultValue: "Bot" })}
                            </Badge>
                          )}
                        </div>
                        <div className="t-body flex flex-col text-site-text-muted sm:flex-row sm:items-center sm:gap-2">
                          {isEditingThis ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span>@</span>
                              <Input
                                type="text"
                                value={handleInput}
                                onChange={(e) => setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                className="h-9 w-36 py-1"
                                aria-label={t("title-change-handle", { defaultValue: "Change handle" })}
                                autoFocus
                                maxLength={20}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveHandle(user.id); if (e.key === 'Escape') cancelEditHandle(); }}
                              />
                              <IconButton icon={Check} size="icon-xs" variant="default" label={t("save-handle", { defaultValue: "Save handle" })} onClick={() => saveHandle(user.id)} disabled={busy} />
                              <IconButton icon={X} size="icon-xs" variant="ghost" label={t("cancel-handle", { defaultValue: "Cancel" })} onClick={cancelEditHandle} />
                              {handleError && <span className="t-meta text-site-danger">{handleError}</span>}
                            </div>
                          ) : (
                            <span className="flex items-center gap-2 truncate">
                              @{user.handle || '\u2014'}
                              {!user.isAdmin && (
                                <IconButton icon={Pencil} size="icon-xs" variant="ghost" label={t("title-change-handle", { defaultValue: "Change handle" })} onClick={() => startEditHandle(user)} />
                              )}
                            </span>
                          )}
                          {secondaryLine && (
                            <>
                              <span className="hidden sm:inline" aria-hidden>&bull;</span>
                              <span className="truncate">{secondaryLine}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="t-meta flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 sm:order-last sm:w-24 sm:flex-none sm:flex-col sm:items-end">
                      <span>{t("user-builds", { count: user._count.userBuilds, defaultValue: "{{count}} builds" })}</span>
                      <span>{t("user-posts", { count: user._count.rmharks, defaultValue: "{{count}} posts" })}</span>
                      <span className="flex items-center gap-1"><Coins className="size-3" aria-hidden />{(user.profile?.coins ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex shrink-0 justify-center sm:w-20">
                      <IconButton
                        icon={CheckCircle}
                        size="icon-sm"
                        variant={user.isVerified ? 'default' : 'default'}
                        disabled={busy}
                        onClick={() => toggleStatus(user.id, 'isVerified', user.isVerified)}
                        aria-pressed={user.isVerified}
                        label={user.isVerified ? t("title-remove-verification", { defaultValue: "Remove Verification" }) : t("title-verify-user", { defaultValue: "Verify User" })}
                      />
                    </div>
                    <div className="flex shrink-0 justify-center gap-2 sm:w-32">
                      <IconButton icon={Coins} size="icon-sm" variant="default" disabled={busy} onClick={() => setCoins(user)} label={t("title-set-coins", { coins: user.profile?.coins ?? 0, defaultValue: "Set RMH coins (currently {{coins}})" })} />
                      <IconButton icon={Crown} size="icon-sm" variant="default" disabled={busy} onClick={() => grantMembership(user.id)} label={t("title-grant-revoke-membership", { defaultValue: "Grant / revoke membership" })} />
                      <IconButton
                        icon={Shield}
                        size="icon-sm"
                        variant="default"
                        className={user.isAdmin ? 'border-site-danger text-site-danger' : undefined}
                        disabled={busy}
                        onClick={() => toggleStatus(user.id, 'isAdmin', user.isAdmin)}
                        aria-pressed={user.isAdmin}
                        label={user.isAdmin ? t("title-remove-admin", { defaultValue: "Remove Admin" }) : t("title-make-admin", { defaultValue: "Make Admin" })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {loadingMore && (
            <div className="flex justify-center py-4 text-site-text-muted"><Spinner /></div>
          )}
        </div>
      </AdminBody>
    </PageLayout>
  );
}
