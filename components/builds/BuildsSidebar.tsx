import { Gamepad2, AppWindow, Newspaper, Star, ArrowLeft } from 'lucide-react';
import type { NewsArticle } from '@/lib/news';
import type { UserBuild, BuildCategory } from '@prisma/client';
import { Link } from '@tanstack/react-router';

type FullBuild = UserBuild & { category?: BuildCategory | null };

interface BuildsRightSidebarProps {
    games: FullBuild[];
    apps: FullBuild[];
    newsArticles: Partial<NewsArticle>[];
}

export function BuildsRightSidebar({ games, apps, newsArticles }: BuildsRightSidebarProps) {
    const featuredGames = games.filter(g => g.featured).slice(0, 4);

    return (
        <div className="p-4 space-y-6">
            {/* Back to Categories */}
            <Link to="/builds"
                className="flex items-center gap-1.5 text-sm text-site-accent hover:text-site-accent-hover transition-colors"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                All Categories
            </Link>

            {/* Featured Games */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Star className="w-5 h-5 text-site-accent" />
                    Featured
                </h2>
                <div className="space-y-2">
                    {featuredGames.map((game) => (
                        <Link
                            key={game.id}
                            to={`/builds/${game.slug}` as string}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
                        >
                            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-site-surface to-site-surface-hover flex items-center justify-center shrink-0">
                                <Gamepad2 className="w-4 h-4 text-site-text-dim" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                                    {game.title}
                                </p>
                                <p className="text-xs text-site-text-dim">{game.visibility}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Apps */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <AppWindow className="w-5 h-5 text-site-accent" />
                    Apps &amp; Tools
                </h2>
                <div className="space-y-2">
                    {apps.map((app) => (
                        <Link
                            key={app.id}
                            to={`/builds/${app.slug}` as string}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-site-surface-hover transition-colors group"
                        >
                            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-site-surface to-site-surface-hover flex items-center justify-center shrink-0">
                                <AppWindow className="w-4 h-4 text-site-text-dim" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors truncate">
                                    {app.title}
                                </p>
                                <p className="text-xs text-site-text-dim">{app.visibility}</p>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* Categories */}
            <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                    <Gamepad2 className="w-5 h-5 text-site-accent" />
                    Categories
                </h2>
                <div className="flex flex-wrap gap-2">
                    {Array.from(new Set([...games, ...apps].flatMap(g => Array.isArray(g.technologies) ? g.technologies as string[] : []))).slice(0, 15).map(tag => (
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
                            to={`/news/${article.slug}` as string}
                            className="block group"
                        >
                            <p className="text-xs text-site-text-dim">{article.category}</p>
                            <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                                {article.title}
                            </p>
                        </Link>
                    ))}
                </div>
                <Link to="/news"
                    className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors"
                >
                    Show more
                </Link>
            </section>
        </div>
    );
}
