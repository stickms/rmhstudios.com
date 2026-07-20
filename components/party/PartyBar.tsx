'use client';

import { useState } from 'react';
import { Crown, Gamepad2, LogOut, UserPlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useParty } from '@/hooks/useParty';
import type { PartyMemberView } from '@/lib/party/types';

/**
 * Candidate party-enabled games (design §5 rollout order). The socket handler is
 * authoritative — `party:queue` errors with a toast if a game hasn't yet
 * registered a `PartyJoinable`, so listing them here is safe before rollout.
 * `id` must match the game's `registerPartyGame(id, …)` id (also its route).
 */
const PARTY_GAMES: { id: string; label: string }[] = [
  { id: 'rmhbox', label: 'RMHBox' },
  { id: 'synapse-storm', label: 'Synapse Storm' },
  { id: 'holdem', label: "Hold'em" },
  { id: 'kowloon-knockout', label: 'Kowloon Knockout' },
];

function MemberAvatar({ member, size = 30 }: { member: PartyMemberView; size?: number }) {
  const initial = (member.name?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <span className="relative inline-flex" title={member.name ?? undefined}>
      {member.image ? (
        <img
          src={member.image}
          alt=""
          className="rounded-full object-cover ring-2 ring-site-bg"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="grid place-items-center rounded-full bg-site-surface-hover text-xs font-semibold text-site-text-muted ring-2 ring-site-bg"
          style={{ width: size, height: size }}
        >
          {initial}
        </span>
      )}
      {member.isLeader && (
        <Crown className="absolute -right-1 -top-1 h-3.5 w-3.5 text-site-warning" aria-hidden />
      )}
    </span>
  );
}

/**
 * Docked party pill for the site shell (and game shells). Renders nothing when
 * signed out. Mount once — see integration notes for placement.
 */
export function PartyBar() {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const { party, createParty, leave, queue } = useParty();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!session?.user) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 flex justify-center px-3 md:bottom-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-site-border bg-site-surface/95 px-3 py-2 shadow-site backdrop-blur">
        {!party ? (
          <Button size="sm" variant="accent" onClick={createParty} className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden />
            {t('party-start', { defaultValue: 'Start a party' })}
          </Button>
        ) : (
          <>
            <div className="flex -space-x-2">
              {party.members.map((m) => (
                <MemberAvatar key={m.userId} member={m} />
              ))}
            </div>
            <span className="px-1 text-xs text-site-text-muted">
              {party.members.length}/{party.maxSize}
            </span>

            <div className="relative">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMenuOpen((o) => !o)}
                className="gap-1.5"
              >
                <Gamepad2 className="h-4 w-4" aria-hidden />
                {t('party-choose-game', { defaultValue: 'Choose game' })}
              </Button>
              {menuOpen && (
                <div
                  className="absolute bottom-full right-0 mb-2 w-52 rounded-site border border-site-border bg-site-surface p-1 shadow-site"
                  role="menu"
                >
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">
                      {t('party-games', { defaultValue: 'Party games' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMenuOpen(false)}
                      className="rounded p-0.5 text-site-text-dim hover:text-site-text"
                      aria-label={t('close', { defaultValue: 'Close' })}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  {PARTY_GAMES.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        queue(g.id);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-site-sm px-2 py-1.5 text-left text-sm text-site-text',
                        'hover:bg-site-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent',
                      )}
                    >
                      <Gamepad2 className="h-4 w-4 text-site-accent" aria-hidden />
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={leave}
              aria-label={t('party-leave', { defaultValue: 'Leave party' })}
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
