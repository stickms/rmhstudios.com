/**
 * RMHCharacters' root wrapper: the palette and the shared AppShell. Appearance
 * follows the system light/dark setting (the server renders light, the client
 * switches after hydration).
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import AppShell from '@/components/shared/AppShell';

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export default function RmhCharactersShell({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(QUERY).matches ? 'dark' : 'light'),
    () => 'light',
  );
  return (
    <AppShell appClassName="rmhc-app" theme={theme}>
      {children}
    </AppShell>
  );
}
