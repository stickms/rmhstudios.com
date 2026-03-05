'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PageLayout } from '@/components/feed/PageLayout';
import Link from 'next/link';
import { ArrowLeft, Loader2, Search, CheckCircle, Shield, AlertCircle, Edit, ExternalLink, Globe, Lock, Save, Ban } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { useRouter } from 'next/navigation';
import { AdminRightSidebar } from '@/components/feed/AdminRightSidebar';

interface Build {
    id: string;
    slug: string;
    title: string;
    status: string;
    visibility: string;
    publishedAt: string | null;
    user: { name: string; username: string; handle?: string | null };
    category?: { name: string } | null;
}

export default function AdminUserBuildsPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const [builds, setBuilds] = useState<Build[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [search, setSearch] = useState('');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLDivElement) => {
        if (loading || loadingMore) return;
        if (observer.current) observer.current.disconnect();

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore && !loadingMore) {
                loadMore();
            }
        });

        if (node) observer.current.observe(node);
    }, [loading, loadingMore, hasMore]);

    useEffect(() => {
        if (session && !(session.user as any).isAdmin) {
            router.push('/');
        }
    }, [session, router]);

    useEffect(() => {
        const fetchBuilds = async () => {
            setLoading(true);
            try {
                // Fetch using our standard user-builds API which supports search and cursors
                const url = search 
                    ? `/api/user-builds?search=${encodeURIComponent(search)}&limit=20` 
                    : '/api/user-builds?limit=20';
                    
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    setBuilds(data.items || []);
                    setNextCursor(data.nextCursor);
                    setHasMore(data.hasMore);
                }
            } catch (error) {
                console.error("Failed to fetch builds", error);
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchBuilds();
        }, 500); // debounce search slower for DB hits

        return () => clearTimeout(timeoutId);
    }, [search]);

    const loadMore = async () => {
        if (!nextCursor || loadingMore) return;
        
        setLoadingMore(true);
        try {
            const url = search 
                ? `/api/user-builds?search=${encodeURIComponent(search)}&cursor=${nextCursor}&limit=20` 
                : `/api/user-builds?cursor=${nextCursor}&limit=20`;
                
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setBuilds(prev => [...prev, ...(data.items || [])]);
                setNextCursor(data.nextCursor);
                setHasMore(data.hasMore);
            }
        } catch (error) {
            console.error("Failed to fetch more builds", error);
        } finally {
            setLoadingMore(false);
        }
    };

    return (
        <PageLayout title="Manage User Builds" wide rightSidebar={<AdminRightSidebar />}>
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin" className="p-2 hover:bg-site-surface-hover rounded-full transition-colors">
                        <ArrowLeft className="w-5 h-5 text-site-text-dim" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-site-text">User Builds</h1>
                        <p className="text-site-text-muted mt-1">Search, moderate, and manage all user-submitted builds.</p>
                    </div>
                </div>

                <div className="bg-site-surface border border-site-border rounded-xl overflow-hidden p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-site-text-dim" />
                        <input
                            type="text"
                            placeholder="Search by build title or description..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-site-bg border border-site-border rounded-lg pl-10 pr-4 py-2.5 text-site-text focus:outline-none focus:border-site-accent/50 focus:ring-1 focus:ring-site-accent/50 transition-all placeholder:text-site-text-dim/50"
                        />
                    </div>
                </div>

                <div className="bg-site-surface border border-site-border rounded-xl overflow-hidden min-h-[400px]">
                    <div className="divide-y divide-site-border relative">
                        {loading && (
                            <div className="absolute inset-0 bg-site-surface/50 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-8">
                                <Loader2 className="w-8 h-8 text-site-accent animate-spin mb-4" />
                                <span className="text-site-text-muted">Loading builds...</span>
                            </div>
                        )}
                        
                        {!loading && builds.length === 0 && (
                            <div className="p-12 text-center text-site-text-muted flex flex-col items-center">
                                <AlertCircle className="w-8 h-8 mb-3 text-site-text-dim" />
                                <p>No builds found matching your search.</p>
                            </div>
                        )}

                        {builds.map((build, index) => {
                            const isLast = index === builds.length - 1;
                            
                            return (
                                <div 
                                    key={build.id} 
                                    ref={isLast ? lastElementRef : null}
                                    className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-site-surface-hover transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Link href={`/user-builds/${build.slug}`} className="font-semibold text-lg text-site-text hover:text-site-accent truncate">
                                                {build.title}
                                            </Link>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                build.visibility === 'PUBLIC' ? 'bg-green-500/10 text-green-400' : build.visibility === 'UNLISTED' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-site-bg text-site-text-dim'
                                            }`}>
                                                {build.visibility}
                                            </span>
                                            {build.visibility === 'PRIVATE' && (
                                                <Lock className="w-3.5 h-3.5 text-site-text-dim ml-1" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-site-text-dim truncate">
                                            <Link href={`/@${build.user.handle || build.user.username}`} className="hover:text-site-text transition-colors">
                                                @{build.user.handle || build.user.username}
                                            </Link>
                                            <span>•</span>
                                            <span>{build.category?.name || 'Uncategorized'}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 mt-3 sm:mt-0">
                                        <Link
                                            href={`/user-builds/${build.slug}`}
                                            className="p-2 rounded-lg text-site-text-dim hover:text-site-accent hover:bg-site-bg transition-colors border border-transparent hover:border-site-border"
                                            title="View Build"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </Link>
                                        <Link
                                            href={`/user-builds/submit?edit=${build.id}`}
                                            className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors border border-transparent hover:border-blue-500/20"
                                            title="Edit Build as Admin"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}

                        {loadingMore && (
                            <div className="p-4 flex justify-center text-site-text-dim">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </PageLayout>
    );
}
