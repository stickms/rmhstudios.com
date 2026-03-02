'use client';

import Link from 'next/link';
import { AppWindow, Newspaper } from 'lucide-react';
import type { AppInfo } from '@/lib/apps';
import type { NewsArticle } from '@/lib/news';

interface AppsRightSidebarProps {
    apps: AppInfo[];
    newsArticles: Partial<NewsArticle>[];
}

export function AppsRightSidebar({ apps, newsArticles }: AppsRightSidebarProps) {
    const visible = apps.filter(a => !a.hidden);

    return (
        <div className="p-4 space-y-6">
            {/* Popular Apps */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <AppWindow className="w-5 h-5 text-site-accent" />
                    Popular Apps
                </h2>
                <div className="space-y-2">
                    {visible.map((app) => (
                        <Link
                            key={app.id}
                            href={app.href}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
                        >
                            <div className={`w-8 h-8 rounded-lg bg-linear-to-br ${app.gradient} flex items-center justify-center shrink-0`}>
                                <AppWindow className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                                    {app.title}
                                </p>
                                <p className="text-xs text-site-text-dim">{app.status}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Latest News */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Newspaper className="w-5 h-5 text-site-accent" />
                    Latest News
                </h2>
                <div className="space-y-3">
                    {newsArticles.slice(0, 4).map((article) => (
                        <Link
                            key={article.slug}
                            href={`/news/${article.slug}`}
                            className="block group"
                        >
                            <p className="text-xs text-site-text-dim">{article.category}</p>
                            <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                                {article.title}
                            </p>
                        </Link>
                    ))}
                </div>
                <Link
                    href="/news"
                    className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors"
                >
                    Show more
                </Link>
            </section>
        </div>
    );
}
