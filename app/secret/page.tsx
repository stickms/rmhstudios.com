'use client';

import Link from 'next/link';
import {
    Briefcase,
    BookOpen,
    Cloud,
    UtensilsCrossed,
    FileText,
    Presentation,
    Table2,
    ArrowLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SecretApp {
    id: string;
    name: string;
    desc: string;
    icon: LucideIcon;
    accent: string;
    href: string;
}

const secretApps: SecretApp[] = [
    { id: 'jobs', name: 'RMH Jobs', desc: 'Job search platform (rejection guaranteed)', icon: Briefcase, accent: '#00ff88', href: '/secret/jobs' },
    { id: 'notes', name: 'RMH Notes', desc: 'Cozy notes & reminders', icon: BookOpen, accent: '#C17F3A', href: '/secret/notes' },
    { id: 'weather', name: 'RMH Weather', desc: 'Premium weather dashboard', icon: Cloud, accent: '#64748b', href: '/secret/weather' },
    { id: 'eats', name: 'RMH Eats', desc: 'Food delivery simulator', icon: UtensilsCrossed, accent: '#ef4444', href: '/secret/eats' },
    { id: 'docs', name: 'RMH Docs', desc: 'Word processor', icon: FileText, accent: '#06b6d4', href: '/secret/docs' },
    { id: 'slides', name: 'RMH Slides', desc: 'Presentation editor', icon: Presentation, accent: '#f97316', href: '/secret/slides' },
    { id: 'sheets', name: 'RMH Sheets', desc: 'Spreadsheet editor', icon: Table2, accent: '#10b981', href: '/secret/sheets' },
];

export default function SecretPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            <div className="mx-auto max-w-5xl px-6 py-12">
                <Link
                    href="/"
                    className="mb-8 inline-flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>

                <div className="mb-12 text-center">
                    <h1 className="mb-2 text-4xl font-bold tracking-tight">The Vault</h1>
                    <p className="text-white/40">Experimental apps. All data saved locally in your browser.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {secretApps.map((app) => {
                        const Icon = app.icon;
                        return (
                            <Link
                                key={app.id}
                                href={app.href}
                                className="group relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.03] p-6 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.06]"
                            >
                                <div
                                    className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                                    style={{
                                        background: `radial-gradient(ellipse at center, ${app.accent}08 0%, transparent 70%)`,
                                    }}
                                />
                                <div className="relative">
                                    <div
                                        className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
                                        style={{ backgroundColor: `${app.accent}15`, color: app.accent }}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <h2 className="mb-1 text-lg font-semibold">{app.name}</h2>
                                    <p className="text-sm text-white/40">{app.desc}</p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
