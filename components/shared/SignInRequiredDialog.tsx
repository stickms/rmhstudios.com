/**
 * The sign-in gate, as a modal rather than a redirect.
 *
 * Games no longer bounce a signed-out visitor to `/login` at the door. Almost
 * everything in a single-player game works without an account — the save lives
 * in `localStorage` until there is somewhere better to put it — so the door is
 * the wrong place to ask. What genuinely needs an account is narrower and comes
 * later: joining a lobby, posting a score to a leaderboard, spending coins,
 * carrying a save between devices.
 *
 * So the ask moves to the moment it becomes true. That matters for more than
 * politeness: a redirect throws away everything on screen, and a person who
 * pressed "Multiplayer" in a game they were already enjoying comes back to a
 * blank menu. This keeps the game mounted underneath, states which feature
 * wanted the account, and returns them to the same URL.
 *
 * Use {@link useSignInGate} rather than this component directly.
 */
'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { useSession } from '@/components/Providers';

export interface SignInRequiredDialogProps {
  open: boolean;
  onClose: () => void;
  /** What the player just tried to do — "Play online", "Save to your account". */
  feature?: string;
  /** Where to come back to. Defaults to the current URL. */
  callbackURL?: string;
}

export function SignInRequiredDialog({
  open,
  onClose,
  feature,
  callbackURL,
}: SignInRequiredDialogProps) {
  const { t } = useTranslation('shared');
  // Radix owns Escape, the focus trap, scroll lock and focus return. Focus lands on the first
  // action (the sign-in link or "Keep playing"), as it did before.
  const ref = useRef<HTMLDivElement>(null);

  if (!open) return null;

  // Read at click time, not at render time: a game that changes its URL as you
  // move through menus should return you to where you actually were.
  const href = () => {
    const target =
      callbackURL ?? (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search);
    return `/login?callbackURL=${encodeURIComponent(target)}`;
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay
          className="app-overlay"
          style={{ background: 'var(--app-scrim, rgb(0 0 0 / 0.72))' }}
        />
      <DialogPrimitive.Content
        ref={ref}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          ref.current?.querySelector<HTMLElement>('a, button')?.focus();
        }}
        aria-labelledby="sign-in-required-title"
        aria-describedby={undefined}
        className="app-modal fixed left-1/2 top-1/2 z-50 w-[calc(100dvw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 p-5 outline-none"
        style={{
          background: 'var(--app-surface, #27282c)',
          color: 'var(--app-text, #e8e8ec)',
          border: '1px solid var(--app-border, #3a3b42)',
          borderRadius: 'var(--app-radius-lg, 16px)',
          boxShadow: 'var(--app-shadow, 0 24px 60px rgb(0 0 0 / 0.45))',
          fontFamily: 'var(--app-font-body, inherit)',
        }}
      >
        <div className="flex items-center gap-2">
          <LogIn className="size-4 shrink-0" aria-hidden style={{ color: 'var(--app-accent, #6ea8d9)' }} />
          <DialogPrimitive.Title
            id="sign-in-required-title"
            className="text-base font-semibold"
            style={{ fontFamily: 'var(--app-font-display, inherit)' }}
          >
            {t('sign-in-required-title', { defaultValue: 'This part needs an account' })}
          </DialogPrimitive.Title>
        </div>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--app-text-muted, #9a9ba4)' }}>
          {feature
            ? t('sign-in-required-feature', {
                feature,
                defaultValue:
                  '{{feature}} needs an account. Everything else here works signed out, and your progress on this device is kept either way.',
              })
            : t('sign-in-required-text', {
                defaultValue:
                  'This needs an account. Everything else here works signed out, and your progress on this device is kept either way.',
              })}
        </p>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm font-medium transition-colors"
            style={{
              background: 'var(--app-surface-hover, #313238)',
              color: 'var(--app-text, #e8e8ec)',
              borderRadius: 'var(--app-radius-sm, 8px)',
            }}
          >
            {t('sign-in-required-later', { defaultValue: 'Keep playing' })}
          </button>
          {/* A real link, not a router navigation: `/login` is outside every
              game's shell, and a full document load is what clears the game's
              audio graph, sockets and animation frames on the way out. */}
          <a
            href={href()}
            className="px-3 py-2 text-center text-sm font-semibold transition-colors"
            style={{
              background: 'var(--app-accent, #6ea8d9)',
              color: 'var(--app-accent-fg, #06121c)',
              borderRadius: 'var(--app-radius-sm, 8px)',
            }}
          >
            {t('sign-in-required-go', { defaultValue: 'Sign in' })}
          </a>
        </div>
      </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   The hook
   ══════════════════════════════════════════════════════════════════════════ */

export interface SignInGate {
  /** True once the session has resolved and there is a user. */
  signedIn: boolean;
  /**
   * Run `action` if signed in; otherwise show the modal and do nothing.
   * Returns whether the action ran, for callers that need to bail early.
   */
  require: (action?: () => void, feature?: string) => boolean;
  /** Render this somewhere in the tree. */
  dialog: ReactNode;
}

/**
 * Wrap an account-only action.
 *
 *     const gate = useSignInGate();
 *     <button onClick={() => gate.require(joinLobby, 'Playing online')}>Online</button>
 *     {gate.dialog}
 *
 * While the session is still resolving `signedIn` is false, so an early tap
 * shows the modal rather than silently dropping the action — which is the
 * recoverable failure of the two, since the modal is dismissible and the button
 * is still there behind it.
 */
export function useSignInGate(defaultFeature?: string): SignInGate {
  const session = useSession();
  const [feature, setFeature] = useState<string | undefined>(defaultFeature);
  const [open, setOpen] = useState(false);
  const signedIn = Boolean(session.data?.user);

  const close = useCallback(() => setOpen(false), []);

  const require = useCallback(
    (action?: () => void, asked?: string) => {
      if (signedIn) {
        action?.();
        return true;
      }
      setFeature(asked ?? defaultFeature);
      setOpen(true);
      return false;
    },
    [signedIn, defaultFeature],
  );

  return {
    signedIn,
    require,
    dialog: <SignInRequiredDialog open={open} onClose={close} feature={feature} />,
  };
}
