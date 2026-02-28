import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { VersecraftClient } from './client';

export default async function VersecraftPage() {
  let isLoggedIn = false;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
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
