/**
 * Admin Users Route
 */

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { PageLayout } from '@/components/feed/PageLayout';
import { ArrowLeft, Loader2, Search, CheckCircle, Shield, AlertCircle, Pencil, Check, X } from 'lucide-react';
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
  _count: { userBuilds: number; rmharks: number };
}

export const Route = createFileRoute('/_site/admin/users')({
  component: AdminUsersPage,
});

function AdminUsersPage() {
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
    if (field === 'isAdmin' && !currentValue && !confirm("Are you sure you want to grant Admin privileges to this user? They will have full access to the database.")) return;
    if (field === 'isAdmin' && currentValue && userId === session?.user?.id) { alert("You cannot remove your own admin privileges from the dashboard."); return; }
    setUpdating(userId);
    try {
      const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, [field]: !currentValue }) });
      if (res.ok) { const updated = await res.json(); setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u)); }
      else { const err = await res.text(); alert(`Failed to update user: ${err}`); }
    } catch (error) { console.error("Failed to update user", error); alert("Failed to connect to server."); } finally { setUpdating(null); }
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
      else { const data = await res.json().catch(() => ({})); setHandleError(data.error || 'Failed to update handle'); }
    } catch { setHandleError('Failed to connect to server'); } finally { setUpdating(null); }
  };

  return (
    <PageLayout title="Manage Users" wide>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-site-text-dim" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-display text-site-text">Manage Users</h1>
            <p className="text-site-text-muted mt-1">Search users, verify accounts, and manage admin privileges.</p>
          </div>
        </div>

        <div className="bg-site-surface border border-site-border rounded-xl overflow-hidden p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-site-text-dim" />
            <input type="text" placeholder="Search by name, handle, or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-site-bg border border-site-border rounded-lg pl-10 pr-4 py-2.5 text-site-text focus:outline-none focus:border-site-accent/50 focus:ring-1 focus:ring-site-accent/50 transition-all placeholder:text-site-text-dim/50" />
          </div>
        </div>

        <div className="bg-site-surface border border-site-border rounded-xl overflow-hidden min-h-[400px]">
          <div className="p-4 border-b border-site-border bg-site-bg/50">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 text-xs font-semibold text-site-text-dim uppercase tracking-wider">
              <div>User</div>
              <div className="w-20 text-center">Verified</div>
              <div className="w-20 text-center">Admin</div>
              <div className="w-24 text-right">Activity</div>
            </div>
          </div>

          <div className="divide-y divide-site-border relative">
            {loading && (
              <div className="absolute inset-0 bg-site-surface/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-8">
                <Loader2 className="w-8 h-8 text-site-accent animate-spin mb-4" />
                <span className="text-site-text-muted">Loading users...</span>
              </div>
            )}

            {!loading && users.length === 0 && (
              <div className="p-12 text-center text-site-text-muted flex flex-col items-center">
                <AlertCircle className="w-8 h-8 mb-3 text-site-text-dim" />
                <p>No users found matching your search.</p>
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
                        {user.isVerified && <CheckCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                        {user.isAdmin && <Shield className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 text-sm text-site-text-dim">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <span className="text-site-text-dim">@</span>
                            <input type="text" value={handleInput} onChange={(e) => setHandleInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="bg-site-bg border border-site-border rounded px-1.5 py-0.5 text-sm text-site-text w-32 focus:outline-none focus:border-site-accent" autoFocus maxLength={20} onKeyDown={(e) => { if (e.key === 'Enter') saveHandle(user.id); if (e.key === 'Escape') cancelEditHandle(); }} />
                            <button onClick={() => saveHandle(user.id)} className="p-0.5 text-emerald-400 hover:text-emerald-300" disabled={updating === user.id}><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={cancelEditHandle} className="p-0.5 text-site-text-dim hover:text-site-text"><X className="w-3.5 h-3.5" /></button>
                            {handleError && <span className="text-xs text-red-400">{handleError}</span>}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 truncate">
                            @{user.handle || '\u2014'}
                            {!user.isAdmin && (
                              <button onClick={(e) => { e.stopPropagation(); startEditHandle(user); }} className="p-0.5 text-site-text-dim hover:text-site-accent transition-colors" title="Change handle">
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
                    <button onClick={() => toggleStatus(user.id, 'isVerified', user.isVerified)} disabled={updating === user.id} className={`p-1.5 rounded-lg transition-colors border ${user.isVerified ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20' : 'bg-transparent text-site-text-dim border-site-border hover:border-site-text-muted'} ${updating === user.id ? 'opacity-50 cursor-not-allowed' : ''}`} title={user.isVerified ? "Remove Verification" : "Verify User"}>
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-20 flex-shrink-0 flex justify-center">
                    <button onClick={() => toggleStatus(user.id, 'isAdmin', user.isAdmin)} disabled={updating === user.id} className={`p-1.5 rounded-lg transition-colors border ${user.isAdmin ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-transparent text-site-text-dim border-site-border hover:border-site-text-muted'} ${updating === user.id ? 'opacity-50 cursor-not-allowed' : ''}`} title={user.isAdmin ? "Remove Admin" : "Make Admin"}>
                      <Shield className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="w-24 flex-shrink-0 flex flex-col items-end text-xs text-site-text-dim">
                    <span>{user._count.userBuilds} builds</span>
                    <span>{user._count.rmharks} posts</span>
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
    </PageLayout>
  )
}
