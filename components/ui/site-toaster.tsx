import { useEffect, type CSSProperties } from 'react';
// eslint-disable-next-line no-restricted-imports -- the one module that loads sonner; everything else uses @/lib/toast
import { Toaster, toast } from 'sonner';
import { bindToaster } from '@/lib/toast';

/**
 * sonner colours every part of a toast (the body, the description, the action and cancel buttons, the close
 * button, and the success / error / warning / info variants) from its own light or dark palette. These are its
 * custom properties pointed at the site's tokens, so a toast follows whatever the page is wearing (Day, Night, a
 * user theme, an accent preset) and not just a light/dark guess. Its `theme` prop still picks the few values that
 * have no property. The description's colour has none either; app/styles/steel-overlay.css sets it.
 */
const TOKEN_PALETTE = {
  '--normal-bg': 'var(--site-surface)',
  '--normal-bg-hover': 'var(--site-bg-subtle)',
  '--normal-text': 'var(--site-text)',
  '--normal-border': 'var(--site-border)',
  '--normal-border-hover': 'var(--site-border)',
  '--success-bg': 'var(--site-surface)',
  '--success-text': 'var(--site-success)',
  '--success-border': 'var(--site-border)',
  '--info-bg': 'var(--site-surface)',
  '--info-text': 'var(--site-text)',
  '--info-border': 'var(--site-border)',
  '--warning-bg': 'var(--site-surface)',
  '--warning-text': 'var(--site-text)',
  '--warning-border': 'var(--site-border)',
  '--error-bg': 'var(--site-surface)',
  '--error-text': 'var(--site-danger)',
  '--error-border': 'var(--site-border)',
} as CSSProperties;

/**
 * The site's sonner `<Toaster>`: one placement and one fill for every toast.
 * Loaded by `<ToastHost>` (components/ui/toast-host.tsx) on the first toast, on
 * the site and in a separately built island (redesign audit B1), so a toast
 * looks and sits the same in both.
 */
export function SiteToaster({ theme }: { theme: 'light' | 'dark' }) {
  // The `<Toaster>` below subscribes to sonner's store in its own effect, and a
  // child's effect runs before its parent's: by the time this one runs, a toast
  // replayed from the queue has a listener to land on.
  useEffect(() => bindToaster(toast), []);
  return (
    <Toaster
      theme={theme}
      // Bottom right (owner, 2026-11-13). On a desktop that corner is the margin column, clear of the globe at the
      // foot of the sidebar.
      position="bottom-right"
      style={TOKEN_PALETTE}
      // The bottom lane is SHARED, and sonner does not know that.
      //
      // Left to its defaults, sonner sits 16px off the bottom edge at
      // `z-index: 999999999` — above everything — and below 600px it
      // rewrites `bottom-right` to span the WHOLE bottom edge. That is
      // the hub orb's lane: the orb is
      // `bottom: calc(env(safe-area-inset-bottom) + var(--site-hub-orb-inset))`
      // and 60px tall, so on a 390px phone a toast covered it almost
      // entirely for its four-second life — and the orb is the site's
      // only navigation control on mobile. The same 16px also lands
      // inside the iOS home-indicator strip, so swipe-to-dismiss
      // fought the system home gesture, and a toast raised from inside
      // a bottom sheet covered the sheet's own confirm/cancel row.
      //
      // `--site-floating-reserve` is derived from the orb's own
      // geometry tokens (globals.css §5.5x), so this clears the orb by
      // construction and cannot drift if the orb is resized. It
      // already includes the safe-area inset — do not add it twice.
      //
      // `--toast-bottom` (app/styles/steel-overlay.css) is that reserve wherever the globe is docked at the bottom
      // of the page, and the plain 16px gap at 1024px and up, where the globe lives in the sidebar.
      offset={{ bottom: 'var(--toast-bottom)', right: '1rem' }}
      mobileOffset={{
        bottom: 'var(--site-floating-reserve)',
        left: '0.75rem',
        right: '0.75rem',
      }}
      toastOptions={{
        // Steel S5: a toast is an overlay. It gets `.surface-overlay`'s fill, border, radius and T4 shadow inline,
        // because that class also sets position, max sizes and overflow, all of which sonner owns for its own
        // stacking. No blur. Its 160 ms fade (M5) is app/styles/steel-overlay.css.
        style: {
          backgroundColor: 'var(--site-surface)',
          boxShadow: `0 8px 24px rgba(0, 0, 0, ${theme === 'dark' ? 0.5 : 0.12})`,
          border: '1px solid var(--site-border)',
          // A toast is a panel, not a control: `--site-radius`, the
          // same curve every other floating panel takes.
          borderRadius: 'var(--site-radius)',
          color: 'var(--site-text)',
        },
      }}
    />
  );
}
