'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import type { UserBuild, BuildCategory } from '@prisma/client';

interface OfficialBuildCardProps {
    build: UserBuild & { category?: BuildCategory | null };
}

export function OfficialBuildCard({ build }: OfficialBuildCardProps) {
    const cta = build.category?.slug === 'games' ? 'Play Now' : 'Open App';
    const gradient = 'from-site-surface to-site-surface-hover'; // Fallback gradient if no crop data
    const url = build.demoUrl || build.repoUrl || `/builds/${build.slug}`;

    return (
        <Link href={url} className="block h-full">
            <div className="group rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-all overflow-hidden flex flex-col h-full">
                {/* Thumbnail */}
                {build.thumbnailUrl ? (
                    <div className="aspect-video w-full overflow-hidden bg-site-bg relative">
                        <Image
                            src={build.thumbnailUrl}
                            alt={build.title}
                            fill
                            className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 768px) 100vw, 50vw"
                        />
                    </div>
                ) : (
                    <div className={`aspect-video w-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                        <span className="text-4xl font-bold text-site-text/80">
                            {build.title}
                        </span>
                    </div>
                )}

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                    {/* Tags & Status */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent">
                            {build.status}
                        </span>
                        {(Array.isArray(build.technologies) ? build.technologies as string[] : []).slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full text-xs bg-site-bg border border-site-border text-site-text-dim"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-site-text group-hover:text-site-accent transition-colors line-clamp-1 mb-1">
                        {build.title}
                    </h3>

                    {/* Description */}
                    <p className="text-sm text-site-text-muted line-clamp-2 mb-3">
                        {build.description}
                    </p>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t border-site-border mt-auto">
                        <span className="text-xs text-site-text-dim font-mono uppercase">
                            RMH Studios
                        </span>

                        <span
                            className="flex items-center gap-1 text-xs text-site-accent font-semibold hover:text-site-accent-hover transition-colors"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {cta}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
