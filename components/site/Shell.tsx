'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // List of game routes where Navbar should be hidden
  const gameRoutes = ['/vega', '/echoes', '/slice-it', '/laundry-sort', '/cursed-logic', '/signal-forge'];
  
  const isGamePage = gameRoutes.some(route => pathname?.startsWith(route));

  if (isGamePage) {
    return (
        <main className="min-h-screen">
            {children}
        </main>
    );
  }

  return (
    <>
      <Navbar />
      <main className="pt-16 min-h-[calc(100vh-4rem)]">
        {children}
      </main>
    </>
  );
}
