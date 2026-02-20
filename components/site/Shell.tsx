'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from './Navbar';
import { games } from '@/lib/games';


export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // gather gameRoutes from game details objects
  const gameRoutes = games.map(game => game.href);
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
