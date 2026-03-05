'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, MessageCircle, Eye, ArrowRight } from 'lucide-react';
export interface OfficialBuild {
    id: string;
    slug: string;
    title: string;
    description: string;
    thumbnailUrl: string | null;
    demoUrl: string | null;
    repoUrl: string | null;
    technologies: string[];
    likeCount: number;
    commentCount: number;
    viewCount: number;
    liked: boolean;
    category?: { slug: string; name: string } | null;
}

interface OfficialBuildCardProps {
    build: OfficialBuild;
    onLike?: (id: string) => void;
    onView?: (id: string) => void;
}

function formatCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
}

export function OfficialBuildCard({ build, onLike, onView }: OfficialBuildCardProps) {
    const router = useRouter();
    const gradient = 'from-site-surface to-site-surface-hover';
    const cardUrl = build.demoUrl || build.repoUrl || `/builds/${build.slug}`;
    const detailUrl = `/builds/${build.slug}`;

    const handleLike = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onLike?.(build.id);
    };

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't navigate if clicking an interactive child (button, link)
        const target = e.target as HTMLElement;
        if (target.closest('a, button')) return;
        
        const isInternal = cardUrl.startsWith('/');
        if (!isInternal) {
            onView?.(build.id);
            window.open(cardUrl, '_blank');
        } else {
            router.push(cardUrl);
        }
    };

    return (
        <div className="block h-full cursor-pointer" onClick={handleCardClick}>
            <div className="group relative rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-all overflow-hidden h-full min-h-[340px]">
                {/* Thumbnail */}
                {build.thumbnailUrl ? (
                    <div className="absolute inset-0 w-full h-full overflow-hidden bg-site-bg">
                        <Image
                            src={build.thumbnailUrl}
                            alt={build.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 768px) 100vw, 50vw"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/65 via-black/30 to-black/10" />
                    </div>
                ) : (
                    <div className={`absolute inset-0 w-full h-full bg-linear-to-br ${gradient} flex items-center justify-center`}>
                        <span className="text-4xl font-bold text-site-text/80">
                            {build.title}
                        </span>
                    </div>
                )}

                <div className="absolute left-3 right-3 bottom-3 z-10">
                    <h3 className="font-semibold text-white line-clamp-1 drop-shadow-sm">
                        {build.title}
                    </h3>
                </div>

                {/* Hover Pop-up */}
                <div className="pointer-events-none absolute inset-0 z-20 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-200">
                    <div className="absolute inset-2 rounded-xl border border-site-accent/30 bg-site-surface/95 backdrop-blur-sm p-4 flex flex-col">
                        <h3 className="font-semibold text-site-text line-clamp-1 mb-1">
                            {build.title}
                        </h3>

                        <p className="text-sm text-site-text-muted line-clamp-4 mb-3">
                            {build.description}
                        </p>

                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                            {build.category && (
                                <span className="px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent">
                                    {build.category.name}
                                </span>
                            )}
                            {build.technologies.slice(0, 3).map((tag) => (
                                <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-full text-xs bg-site-bg border border-site-border text-site-text-dim"
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>

                        <div className="pt-3 border-t border-site-border mt-auto space-y-2 pointer-events-auto">
                            <div className="flex items-center justify-between text-xs text-site-text-dim">
                                <button
                                    onClick={handleLike}
                                    className={`flex items-center gap-1 transition-colors ${
                                        build.liked ? 'text-red-400' : 'hover:text-red-400'
                                    }`}
                                >
                                    <Heart className={`w-3.5 h-3.5 ${build.liked ? 'fill-current' : ''}`} />
                                    {formatCount(build.likeCount)}
                                </button>
                                <span className="flex items-center gap-1">
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    {formatCount(build.commentCount)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Eye className="w-3.5 h-3.5" />
                                    {formatCount(build.viewCount)}
                                </span>
                            </div>

                            <Link
                                href={detailUrl}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                                className="flex items-center justify-center gap-1 text-xs text-site-accent font-semibold w-full py-1.5 rounded-md border border-transparent hover:border-site-accent/30 hover:bg-site-accent/10 transition-all"
                            >
                                Read More
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
