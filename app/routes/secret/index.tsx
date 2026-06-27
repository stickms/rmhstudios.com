/**
 * Secret Index Route
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  BookOpen,
  Cloud,
  UtensilsCrossed,
  ArrowLeft,
  Swords,
  BrainCircuit,
  Zap,
  Newspaper,
  FlaskConical,
  Map,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const Route = createFileRoute('/secret/')({
  component: SecretPage,
});

interface SecretItem {
  id: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  accent: string;
  href: string;
}

const secretGames: SecretItem[] = [
  { id: 'satans-library', name: "Satan's Library", desc: 'Survival horror — lock in or lose', icon: BookOpen, accent: '#dc2626', href: '#' },
  { id: 'vega', name: 'Project Vega', desc: 'Clinical horror tower defense', icon: BrainCircuit, accent: '#16a34a', href: '/secret/vega' },
  { id: 'cursed-logic', name: 'Cursed Logic', desc: 'Psychological duel vs. rogue AI', icon: Swords, accent: '#ca8a04', href: '/secret/cursed-logic' },
  { id: 'signal-forge', name: 'Signal Forge', desc: 'Rhythmic roguelike deckbuilder', icon: Zap, accent: '#06b6d4', href: '/secret/signal-forge' },
];

const secretPages: SecretItem[] = [
  { id: 'news', name: 'News', desc: 'Latest announcements & updates', icon: Newspaper, accent: '#3b82f6', href: '/news' },
  { id: 'research', name: 'Research', desc: 'Peer-reviewed papers & studies', icon: FlaskConical, accent: '#8b5cf6', href: '/research' },
  { id: 'roadmap', name: 'Roadmap', desc: "What's next for RMH Studios", icon: Map, accent: '#10b981', href: '/roadmap' },
];

const secretApps: SecretItem[] = [
  { id: 'jobs', name: 'RMH Jobs', desc: 'Job search platform (rejection guaranteed)', icon: Briefcase, accent: '#00ff88', href: '/secret/jobs' },
  { id: 'notes', name: 'RMH Notes', desc: 'Cozy notes & reminders', icon: BookOpen, accent: '#C17F3A', href: '/secret/notes' },
  { id: 'weather', name: 'RMH Weather', desc: 'Premium weather dashboard', icon: Cloud, accent: '#64748b', href: '/secret/weather' },
  { id: 'eats', name: 'RMH Eats', desc: 'Food delivery simulator', icon: UtensilsCrossed, accent: '#ef4444', href: '/secret/eats' },
];

function ItemCard({ item }: { item: SecretItem }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      className="group relative overflow-hidden rounded-xl border border-white/6 bg-white/3 p-6 transition-all duration-300 hover:border-white/12 hover:bg-white/6"
    >
      <div
        className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(ellipse at center, ${item.accent}08 0%, transparent 70%)` }}
      />
      <div className="relative">
        <div
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${item.accent}15`, color: item.accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="mb-1 text-lg font-semibold">{item.name}</h2>
        <p className="text-sm text-white/40">{item.desc}</p>
      </div>
    </Link>
  );
}

function SecretPage() {
  const { t } = useTranslation("r-secret");
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white/70"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back", { defaultValue: "Back" })}
        </Link>

        <div className="mb-12 text-center">
          <h1 className="mb-2 text-4xl font-bold tracking-tight">{t("the-vault", { defaultValue: "The Vault" })}</h1>
          <p className="text-white/40">{t("vault-subtitle", { defaultValue: "Experimental projects. Enter at your own risk." })}</p>
        </div>

        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold text-white/60">{t("section-games", { defaultValue: "Games" })}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {secretGames.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold text-white/60">{t("section-pages", { defaultValue: "Pages" })}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {secretPages.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-white/60">{t("section-apps", { defaultValue: "Apps" })}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {secretApps.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
