import { Toaster } from 'sonner';

/**
 * The site's sonner `<Toaster>`: one placement and one fill for every toast.
 * Mounted once by `components/Providers.tsx` on the site, and by
 * `components/island/IslandProviders.tsx` in a separately built island
 * (redesign audit B1), so a toast looks and sits the same in both.
 */
export function SiteToaster({ theme }: { theme: 'light' | 'dark' }) {
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
        // Toasts are L4 floating UI and get the matching fill inline. It is written out here rather than by
        // adding `.glass-overlay` because that class also sets position, max sizes and overflow — all of
        // which sonner owns for its own stacking. The jelly material (haze floor, CSS rim, carrier) comes
        // from `[data-sonner-toast]` in app/jelly-coverage.css, so only longhands are set here: a
        // `background` / `box-shadow` inline would erase the floor and the rim. No backdrop-filter — no
        // glass role has one (docs/liquid-glass-system.md); the overlay fill is the legibility floor.
        style: {
          // The SAME expression `.glass-overlay` uses (globals.css §L4), not a third answer.
          backgroundColor: 'var(--site-surface)',
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
