import { Newspaper, FlaskConical, Tag } from 'lucide-react';
import type { NewsArticle } from '@/lib/news';
import type { ResearchArticle } from '@/lib/research';
import { Link } from '@tanstack/react-router';

interface BlogRightSidebarProps {
    newsArticles: Partial<NewsArticle>[];
    researchArticles: ResearchArticle[];
    tags: string[];
}

export function BlogRightSidebar({ newsArticles, researchArticles, tags }: BlogRightSidebarProps) {
    return (
        <div className="p-4 space-y-6">
            {/* Popular Tags */}
            {tags.length > 0 && (
                <section className="bg-site-surface rounded-2xl p-4 border border-site-border">
                    <h2 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2 mb-3">
                        <Tag className="w-5 h-5 text-site-accent" />
                        Popular Tags
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {tags.map(tag => (
                            <Link
                                key={tag}
                                to={`/blog?tag=${encodeURIComponent(tag)}`}
                                className="text-xs px-2.5 py-1 rounded-full bg-site-bg border border-site-border text-site-text-muted hover:text-site-accent hover:border-site-accent/50 transition-colors"
                            >
                                {tag}
                            </Link>
                        ))}
                    </div>
                </section>
            )}

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
                            to={`/news/${article.slug}`}
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
