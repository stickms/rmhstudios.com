'use client';

import { useTranslation } from "react-i18next";
import { ExternalLink } from 'lucide-react';

interface NewsSourceBadgeProps {
    publisher: string;
    url: string;
    className?: string;
}

export function NewsSourceBadge({ publisher, url, className }: NewsSourceBadgeProps) {
    const { t } = useTranslation("c-news");
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs text-site-text-dim hover:text-site-accent transition-colors group/source ${className ?? ''}`}
            aria-label={t("read-original-article-on", { defaultValue: "Read original article on {{publisher}}", publisher })}
        >
            <span className="truncate max-w-32">{t("via-publisher", { defaultValue: "via {{publisher}}", publisher })}</span>
            <ExternalLink aria-hidden className="size-3 shrink-0 opacity-50 transition-opacity group-hover/source:opacity-100" />
        </a>
    );
}
