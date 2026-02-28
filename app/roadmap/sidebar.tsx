'use client';

import Link from 'next/link';
import { Newspaper, FlaskConical, Gamepad2, AppWindow } from 'lucide-react';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import type { NewsArticle } from '@/lib/news';
import type { ResearchArticle } from '@/lib/research';

interface RoadmapRightSidebarProps {
    newsArticles: Partial<NewsArticle>[];
    researchArticles: ResearchArticle[];
}

export function RoadmapRightSidebar({ newsArticles, researchArticles }: RoadmapRightSidebarProps) {
    const visibleApps = apps.filter(a => !a.hidden);

    return (
        <div className="p-4 space-y-6">
            {/* Trending on RMH */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Gamepad2 className="w-5 h-5 text-site-accent" />
                    Trending on RMH
                </h2>
                <div className="space-y-2">
                    {games.slice(0, 4).map((game) => (
                        <Link
                            key={game.id}
                            href={game.href}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
                        >
                            <div className={`w-8 h-8 rounded-lg bg-linear-to-br ${game.gradient} flex items-center justify-center shrink-0`}>
                                <Gamepad2 className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                                    {game.title}
                                </p>
                                <p className="text-xs text-site-text-dim">{game.status}</p>
                            </div>
                        </Link>
                    ))}
                    {visibleApps.slice(0, 2).map((app) => (
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
                    {newsArticles.slice(0, 3).map((article) => (
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

            {/* From the Lab */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <FlaskConical className="w-5 h-5 text-site-accent" />
                    From the Lab
                </h2>
                <div className="space-y-3">
                    {researchArticles.slice(0, 3).map((article) => (
                        <Link
                            key={article.slug}
                            href={`/research/${article.slug}`}
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
                    href="/research"
                    className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors"
                >
                    Show more
                </Link>
            </section>
        </div>
    );
}
