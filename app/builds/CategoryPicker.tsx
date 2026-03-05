'use client';

import Link from 'next/link';
import { Gamepad2, AppWindow, ArrowRight, Sparkles, Zap } from 'lucide-react';

interface CategoryPickerProps {
    entertainmentCount?: number;
    appCount?: number;
}

export function CategoryPicker({ entertainmentCount, appCount }: CategoryPickerProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Apps & Tools */}
            <Link
                href="/builds/apps"
                className="group relative rounded-2xl border border-site-border bg-site-surface hover:border-cyan-500/50 transition-all overflow-hidden"
            >
                {/* Gradient background overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* Glow effect */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative p-8 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/20 transition-all duration-300">
                        <AppWindow className="w-10 h-10 text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-2xl font-bold text-site-text group-hover:text-cyan-400 transition-colors">
                            Apps & Tools
                        </h2>
                    </div>
                    <p className="text-sm text-site-text-muted mb-5 max-w-[280px]">
                        Productivity apps, creative tools, and digital utilities built for the community.
                    </p>
                    {appCount !== undefined && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-cyan-400/80 bg-cyan-500/10 px-3 py-1 rounded-full mb-4 border border-cyan-500/10">
                            {appCount} {appCount === 1 ? 'build' : 'builds'}
                        </span>
                    )}
                    <span className="flex items-center gap-1.5 text-sm text-cyan-400 font-semibold group-hover:gap-2.5 transition-all">
                        Browse <ArrowRight className="w-4 h-4" />
                    </span>
                </div>
            </Link>

            {/* Entertainment */}
            <Link
                href="/builds/games"
                className="group relative rounded-2xl border border-site-border bg-site-surface hover:border-site-accent/50 transition-all overflow-hidden"
            >
                {/* Gradient background overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                {/* Glow effect */}
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="relative p-8 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center mb-5 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-purple-500/20 transition-all duration-300">
                        <Gamepad2 className="w-10 h-10 text-purple-400" />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-2xl font-bold text-site-text group-hover:text-purple-400 transition-colors">
                            Entertainment
                        </h2>
                    </div>
                    <p className="text-sm text-site-text-muted mb-5 max-w-[280px]">
                        Browser games, interactive experiences, and narrative adventures to explore.
                    </p>
                    {entertainmentCount !== undefined && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-purple-400/80 bg-purple-500/10 px-3 py-1 rounded-full mb-4 border border-purple-500/10">
                            {entertainmentCount} {entertainmentCount === 1 ? 'build' : 'builds'}
                        </span>
                    )}
                    <span className="flex items-center gap-1.5 text-sm text-purple-400 font-semibold group-hover:gap-2.5 transition-all">
                        Browse <ArrowRight className="w-4 h-4" />
                    </span>
                </div>
            </Link>
        </div>
    );
}
