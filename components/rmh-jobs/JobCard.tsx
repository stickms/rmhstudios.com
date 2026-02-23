'use client';

import Link from 'next/link';
import { MapPin, Building2, Clock, Banknote } from 'lucide-react';

interface JobCardProps {
    id: string;
    title: string;
    company: string;
    description: string;
    type: string;
    location: string;
    salaryRange: string | null;
    publishAt: string;
}

export function JobCard({ id, title, company, description, type, location, salaryRange, publishAt }: JobCardProps) {
    const timeAgo = getTimeAgo(new Date(publishAt));

    return (
        <Link href={`/rmh-jobs/${id}`} className="block">
            <div className="job-card rounded-lg p-5 group" style={{ borderRadius: 'var(--jobs-radius)' }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                        <h3
                            className="font-semibold text-lg leading-tight mb-1 group-hover:text-[var(--jobs-accent)] transition-colors truncate"
                            style={{ color: 'var(--jobs-text)' }}
                        >
                            {title}
                        </h3>
                        <div className="flex items-center gap-2" style={{ color: 'var(--jobs-text-muted)' }}>
                            <Building2 size={14} />
                            <span className="text-sm truncate">{company}</span>
                        </div>
                    </div>
                    <span
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${type === 'silly' ? 'badge-silly' : 'badge-real'}`}
                    >
                        {type === 'silly' ? 'Absurd' : 'Realistic'}
                    </span>
                </div>

                <p
                    className="text-sm leading-relaxed mb-4 line-clamp-2"
                    style={{ color: 'var(--jobs-text-muted)' }}
                >
                    {description}
                </p>

                <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs" style={{ color: 'var(--jobs-text-subtle)' }}>
                    <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {location}
                    </span>
                    {salaryRange && (
                        <span className="flex items-center gap-1">
                            <Banknote size={12} />
                            {salaryRange}
                        </span>
                    )}
                    <span className="flex items-center gap-1 ml-auto">
                        <Clock size={12} />
                        {timeAgo}
                    </span>
                </div>
            </div>
        </Link>
    );
}

function getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
