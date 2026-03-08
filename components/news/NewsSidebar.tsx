import { TrendingUp, FlaskConical } from 'lucide-react';
import type { NewsArticle } from '@/lib/news';
import type { ResearchArticle } from '@/lib/research';
import { Link } from '@tanstack/react-router';

interface NewsRightSidebarProps {
    featuredArticles: Partial<NewsArticle>[];
    researchArticles: ResearchArticle[];
}

export function NewsRightSidebar({ featuredArticles, researchArticles }: NewsRightSidebarProps) {
    return (
        <div className="p-4 space-y-6">
            {/* Trending Stories */}
            {featuredArticles.length > 0 && (
                <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                    <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                        <TrendingUp className="w-5 h-5 text-site-accent" />
                        Trending Stories
                    </h2>
                    <div className="space-y-3">
                        {featuredArticles.slice(0, 5).map((article) => (
                            <Link
                                key={article.slug}
                                to={`/news/${article.slug}`}
                                className="block group"
                            >
                                <p className="text-xs text-site-text-dim">{article.category}</p>
                                <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                                    {article.title}
                                </p>
                                {article.sourcePublisher && (
                                    <p className="text-xs text-site-text-dim mt-0.5">
                                        {article.sourcePublisher}
                                    </p>
                                )}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

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
                            to={`/research/${article.slug}`}
                            className="block group"
                        >
                            <p className="text-xs text-site-text-dim">{article.category}</p>
                            <p className="text-sm font-medium text-site-text group-hover:text-site-accent transition-colors line-clamp-2">
                                {article.title}
                            </p>
                        </Link>
                    ))}
                </div>
                <Link to="/research"
                    className="block text-sm text-site-accent hover:text-site-accent-hover mt-3 transition-colors"
                >
                    Show more
                </Link>
            </section>
        </div>
    );
}
