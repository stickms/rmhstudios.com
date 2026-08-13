'use client';

import { useRef, useState } from 'react';
import { Crown, Gamepad2, LogOut, UserPlus, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { VoiceRoomBanner } from '@/components/groupcall/VoiceRoomBanner';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
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
  { id: 'gabriels-horn', label: "Gabriel's Horn" },
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
 * Party launcher. Renders nothing when signed out.
 *
 * Two layouts share one interactive core:
 * - `inline` (default): a static card, meant to live inside a page section —
 *   currently the player block at the top of **`/games`**, which is where it
 *   moved when Create's Games tab was removed. This is the primary placement;
 *   it does not float over the page.
 * - non-inline: a fixed docked pill (kept for game shells / future use).
 */
export function PartyBar({ inline = true }: { inline?: boolean }) {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const { party, createParty, leave, queue } = useParty();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Placement, the viewport clamp, the close animation, Escape, outside-press
  // dismissal, focus return and the roving arrow keys all live in AnchoredMenu
  // now. This file carried its own usePopPresence + useMenuViewportFit and
  // nothing else — the panel had no Escape and no outside-press, so once open
  // the only way out was the X in its own header. It also rendered in place, so
  // it was measured inside `.radial-frame`'s stacking context (pinned at
  // z-index 1) and painted under the shell's chrome. AnchoredMenu portals to
  // <body>.

  if (!session?.user) return null;

  const core = !party ? (
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

      <VoiceRoomBanner origin="party" originId={party.id} className="min-w-0" />

      <div className="relative">
        <Button
          ref={triggerRef}
          size="sm"
          variant="outline"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="gap-1.5"
        >
          <Gamepad2 className="h-4 w-4" aria-hidden />
          {t('party-choose-game', { defaultValue: 'Choose game' })}
        </Button>
        <AnchoredMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={triggerRef}
          label={t('party-games', { defaultValue: 'Party games' })}
          // Inline card opens the menu downward; the docked pill opens it up.
          // The pop (globals.css §7.1) unfurls from whichever edge that put it
          // on, so the same menu grows down out of the card and up out of the
          // dock — and flips on its own when the chosen side has no room.
          side={inline ? 'bottom' : 'top'}
          className="w-52"
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
            <MenuItem
              key={g.id}
              icon={Gamepad2}
              onSelect={() => {
                queue(g.id);
                setMenuOpen(false);
              }}
            >
              {g.label}
            </MenuItem>
          ))}
        </AnchoredMenu>
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
  );

  if (inline) {
    // The heading row wraps, and the description claims a whole row of its own
    // below `sm`. As one unwrapped row the sentence took the width and left
    // "Party up" about 40px, which rendered as "Party" over "up". (Comment here
    // rather than in the JSX: a `{/* … */}` immediately before a `t()` call
    // makes i18next-parser skip that key.)
    return (
      <section className="mb-4 rounded-site border border-site-border bg-site-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Users className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
          <h3 className="text-sm font-semibold text-site-text">
            {t('party-heading', { defaultValue: 'Party up' })}
          </h3>
          <p className="basis-full text-xs text-site-text-dim sm:basis-auto">
            {t('party-subheading', {
              defaultValue: 'Start a party and pick a game to play with friends.',
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{core}</div>
      </section>
    );
  }

  return (
    <div className="pointer-events-none bottom-above-dock fixed inset-x-0 z-40 flex justify-center px-3 md:bottom-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-site-border bg-site-surface/95 px-3 py-2 shadow-site backdrop-blur">
        {core}
      </div>
    </div>
  );
}
