'use client';

import { ExternalLink } from 'lucide-react';

interface NewsSourceBadgeProps {
    publisher: string;
    url: string;
    className?: string;
}

export function NewsSourceBadge({ publisher, url, className }: NewsSourceBadgeProps) {
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs text-(--site-text-dim) hover:text-(--site-accent) transition-colors group/source ${className ?? ''}`}
            aria-label={`Read original article on ${publisher}`}
        >
            <span className="truncate max-w-[120px]">via {publisher}</span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-50 group-hover/source:opacity-100 transition-opacity" />
        </a>
    );
}
