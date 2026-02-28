'use client';

import Link from 'next/link';
import { Gamepad2, Newspaper, Star } from 'lucide-react';
import type { GameInfo } from '@/lib/games';
import type { NewsArticle } from '@/lib/news';

interface GamesRightSidebarProps {
    games: GameInfo[];
    newsArticles: Partial<NewsArticle>[];
}

export function GamesRightSidebar({ games, newsArticles }: GamesRightSidebarProps) {
    const featured = games.filter(g => g.status === 'Playable').slice(0, 4);

    return (
        <div className="p-4 space-y-6">
            {/* Featured Games */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Star className="w-5 h-5 text-site-accent" />
                    Featured
                </h2>
                <div className="space-y-2">
                    {featured.map((game) => (
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
                </div>
            </section>

            {/* Tags Overview */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Gamepad2 className="w-5 h-5 text-site-accent" />
                    Categories
                </h2>
                <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(games.flatMap(g => g.tags))).slice(0, 12).map(tag => (
                        <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-site-bg border border-site-border text-site-text-muted">
                            {tag}
                        </span>
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
        </div>
    );
}
