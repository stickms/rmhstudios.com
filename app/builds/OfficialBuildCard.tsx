'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import type { GameInfo } from '@/lib/games';

interface OfficialBuildCardProps {
    build: GameInfo;
}

export function OfficialBuildCard({ build }: OfficialBuildCardProps) {
    return (
        <Link href={build.href}>
            <div className="group rounded-xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-all overflow-hidden">
                {/* Thumbnail */}
                {build.imagePath ? (
                    <div className="aspect-video w-full overflow-hidden bg-site-bg relative">
                        <Image
                            src={build.imagePath}
                            alt={build.title}
                            fill
                            className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 768px) 100vw, 50vw"
                        />
                    </div>
                ) : (
                    <div className={`aspect-video w-full bg-gradient-to-br ${build.gradient} flex items-center justify-center`}>
                        <span className="text-4xl font-bold text-white/80">
                            {build.title}
                        </span>
                    </div>
                )}

                {/* Content */}
                <div className="p-4">
                    {/* Tags & Status */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-site-accent-dim text-site-accent">
                            {build.status}
                        </span>
                        {build.tags.slice(0, 3).map((tag) => (
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
                    <div className="flex items-center justify-between pt-3 border-t border-site-border">
                        <span className="text-xs text-site-text-dim font-mono uppercase">
                            RMH Studios
                        </span>

                        <span
                            className="flex items-center gap-1 text-xs text-site-accent font-semibold hover:text-site-accent-hover transition-colors"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {build.cta}
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
