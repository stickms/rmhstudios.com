/**
 * RmhosShell: rmhOS's root wrapper. Palette only; the rest is `AppShell`. The appearance follows
 * the system's light/dark setting (the server renders dark; the client switches after hydration).
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import AppShell from '@/components/shared/AppShell';

const QUERY = '(prefers-color-scheme: light)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export default function RmhosShell({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? 'light' : 'dark'),
    () => 'dark',
  );
  return (
    <AppShell appClassName="rmhos-app" theme={theme}>
      {children}
    </AppShell>
  );
}
