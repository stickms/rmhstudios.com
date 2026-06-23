'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Loader2, Shield, Users, Trophy, Crown, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserAvatar';

interface Member {
  role: 'OWNER' | 'OFFICER' | 'MEMBER';
  contributedXp: number;
  joinedAt: string;
  user: { id: string; name: string | null; handle: string | null; image: string | null };
}

interface ClanDetail {
  slug: string;
  name: string;
  tag: string;
  description: string | null;
  color: string | null;
  memberCount: number;
  totalXp: number;
  rank: number;
  members: Member[];
}

const fmt = (n: number) => n.toLocaleString();

export function ClanDetailColumn({ slug }: { slug: string }) {
  const { t } = useTranslation('feed');
  const [clan, setClan] = useState<ClanDetail | null>(null);
  const [viewer, setViewer] = useState<{ isMember: boolean; inAnotherClan: boolean }>({ isMember: false, inAnotherClan: false });
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/clans/${encodeURIComponent(slug)}`, { credentials: 'include' });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setClan(data.clan);
      setViewer(data.viewer);
      setSignedIn(!!data.signedIn);
    }
  }, [slug]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function act(action: 'join' | 'leave') {
    setBusy(true);
    try {
      const res = await fetch(`/api/clans/${encodeURIComponent(slug)}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        if (action === 'leave') {
          await load();
        } else {
          await load();
        }
      } else {
        const b = await res.json().catch(() => ({}));
        if (b?.error) alert(b.error);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-site-accent" />
      </div>
    );
  }

  if (notFound || !clan) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="font-medium text-site-text">{t("clan-not-found", { defaultValue: "Clan not found" })}</p>
        <Link to="/clans">
          <Button variant="outline">{t("browse-clans", { defaultValue: "Browse clans" })}</Button>
        </Link>
      </div>
    );
  }

  const RoleIcon = (role: Member['role']) => (role === 'OWNER' ? Crown : role === 'OFFICER' ? Star : Users);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-site-border bg-site-bg/80 px-4 py-3 backdrop-blur">
        <Link to="/clans" className="text-site-text-dim hover:text-site-text">
          <Shield className="h-5 w-5" />
        </Link>
        <h1 className="truncate text-lg font-bold text-site-text">{clan.name}</h1>
      </header>

      <div className="p-4">
        {/* Banner */}
        <div className="rounded-2xl border border-site-border bg-site-surface p-5">
          <div className="flex items-center gap-3">
            <span
              className="rounded-lg px-3 py-1.5 text-base font-extrabold text-white"
              style={{ background: clan.color || 'var(--site-accent)' }}
            >
              {clan.tag}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-site-text">{clan.name}</p>
              <p className="inline-flex items-center gap-1 text-xs text-site-text-dim">
                <Trophy className="h-3.5 w-3.5 text-site-accent" /> {t("rank-number", { rank: clan.rank, defaultValue: "Rank #{{rank}}" })}
              </p>
            </div>
            <div className="ml-auto shrink-0">
              {viewer.isMember ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act('leave')}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("leave", { defaultValue: "Leave" })}
                </Button>
              ) : signedIn ? (
                <Button
                  size="sm"
                  variant="accent"
                  disabled={busy || viewer.inAnotherClan}
                  title={viewer.inAnotherClan ? t("leave-current-clan-first", { defaultValue: "Leave your current clan first" }) : undefined}
                  onClick={() => act('join')}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("join", { defaultValue: "Join" })}
                </Button>
              ) : null}
            </div>
          </div>

          {clan.description && <p className="mt-3 text-sm text-site-text">{clan.description}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-site-bg p-3 text-center">
              <p className="text-lg font-bold text-site-text">{fmt(clan.totalXp)}</p>
              <p className="text-[11px] text-site-text-dim">{t("total-xp", { defaultValue: "Total XP" })}</p>
            </div>
            <div className="rounded-lg bg-site-bg p-3 text-center">
              <p className="text-lg font-bold text-site-text">{fmt(clan.memberCount)}</p>
              <p className="text-[11px] text-site-text-dim">{t("members", { defaultValue: "Members" })}</p>
            </div>
          </div>
        </div>

        {/* Members */}
        <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-site-text-dim">{t("members", { defaultValue: "Members" })}</h2>
        <div className="space-y-1">
          {clan.members.map((m, i) => {
            const Icon = RoleIcon(m.role);
            return (
              <div key={m.user.id} className="flex items-center gap-3 rounded-xl border border-site-border bg-site-surface p-2.5">
                <span className="w-5 text-center text-xs font-bold text-site-text-dim">{i + 1}</span>
                <UserAvatar user={m.user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-site-text">{m.user.name || m.user.handle || t("member", { defaultValue: "Member" })}</p>
                  <p className="inline-flex items-center gap-1 text-[11px] text-site-text-dim">
                    <Icon className="h-3 w-3" /> {m.role.toLowerCase()}
                  </p>
                </div>
                <span className="text-sm font-bold text-site-text">{fmt(m.contributedXp)} XP</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
