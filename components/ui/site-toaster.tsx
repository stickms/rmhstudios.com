import { useEffect } from 'react';
// eslint-disable-next-line no-restricted-imports -- the one module that loads sonner; everything else uses @/lib/toast
import { Toaster, toast } from 'sonner';
import { bindToaster } from '@/lib/toast';

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
      position="bottom-left"
      // The bottom lane is SHARED, and sonner does not know that.
      //
      // Left to its defaults, sonner sits 16px off the bottom edge at
      // `z-index: 999999999` — above everything — and below 600px it
      // rewrites `bottom-left` to span the WHOLE bottom edge. That is
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
      offset={{ bottom: 'var(--site-floating-reserve)' }}
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
