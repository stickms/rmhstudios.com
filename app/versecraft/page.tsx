import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import { VersecraftClient } from './client';

export default async function VersecraftPage() {
  let isLoggedIn = false;
  try {
    // TODO: Move auth check to TanStack Start loader
    const session = await auth.api.getSession({ headers: new Headers() });
    isLoggedIn = !!session?.user?.id;
  } catch {
    // Not logged in — that's fine
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1a1520' }}>
      <VersecraftClient isLoggedIn={isLoggedIn} />
    </div>
  );
}
