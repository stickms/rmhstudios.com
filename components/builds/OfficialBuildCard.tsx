import { Heart, MessageCircle, Eye, ArrowRight } from 'lucide-react';
import { Link, useRouter } from '@tanstack/react-router';
import { OptimizedImage } from '@/components/ui/OptimizedImage';

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
        const target = e.target as HTMLElement;
        if (target.closest('button, a')) return;

        const isInternal = cardUrl.startsWith('/');
        if (!isInternal) {
            onView?.(build.id);
            window.open(cardUrl, '_blank');
        } else {
            router.navigate({ to: cardUrl });
        }
    };

    return (
        <div
            className="block w-full cursor-pointer aspect-[2/3]"
            onClick={handleCardClick}
            title={build.description}
        >
            <div className="group relative rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-all overflow-hidden h-full">
                {/* Thumbnail */}
                {build.thumbnailUrl ? (
                    <div className="absolute inset-0 w-full h-full overflow-hidden bg-site-bg">
                        <OptimizedImage
                            src={build.thumbnailUrl}
                            alt={`Screenshot of ${build.title}`}
                            layout="fullWidth"
                            height={400}
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-black/10 transition-opacity duration-300 group-hover:from-black/90 group-hover:via-black/60" />
                    </div>
                ) : (
                    <div className={`absolute inset-0 w-full h-full bg-linear-to-br ${gradient} flex items-center justify-center`}>
                        <span className="text-4xl font-bold text-site-text/80">
                            {build.title}
                        </span>
                    </div>
                )}

                <div className="absolute left-0 right-0 bottom-0 z-10 p-4 pt-12 flex flex-col justify-end bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                    <h3 className="font-semibold text-white line-clamp-1 drop-shadow-sm mb-1 group-hover:-translate-y-1 transition-transform duration-300">
                        {build.title}
                    </h3>

                    {/* Expandable Section on Hover */}
                    <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] transition-[grid-template-rows] duration-300 ease-out">
                        <div className="overflow-hidden">
                            <div className="pt-2 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
                                <div className="flex items-center justify-between text-xs text-white/80">
                                    <button
                                        onClick={handleLike}
                                        aria-label={build.liked ? 'Unlike this build' : 'Like this build'}
                                        className={`flex items-center gap-1.5 transition-colors ${
                                            build.liked ? 'text-red-400' : 'hover:text-red-400'
                                        }`}
                                    >
                                        <Heart className={`w-4 h-4 ${build.liked ? 'fill-current' : ''}`} />
                                        <span>{formatCount(build.likeCount)}</span>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            router.navigate({ to: detailUrl });
                                        }}
                                        aria-label="View comments"
                                        className="flex items-center gap-1.5 hover:text-blue-400 transition-colors"
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        <span>{formatCount(build.commentCount)}</span>
                                    </button>
                                    <span className="flex items-center gap-1.5">
                                        <Eye className="w-4 h-4" />
                                        <span>{formatCount(build.viewCount)}</span>
                                    </span>
                                </div>

                                <Link to={detailUrl}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                    className="flex items-center justify-center gap-1.5 text-xs text-blue-400 border border-blue-400/50 bg-transparent font-semibold w-full py-2 rounded-lg hover:bg-blue-400 hover:text-white hover:border-transparent transition-all"
                                >
                                    Read More
                                    <ArrowRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
