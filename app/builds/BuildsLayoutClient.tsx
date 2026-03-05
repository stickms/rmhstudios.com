'use client';

import { usePathname } from 'next/navigation';
import { PageLayout } from '@/components/feed/PageLayout';
import type { ReactNode } from 'react';

const KNOWN_SUBROUTES = ['/builds', '/builds/games', '/builds/apps'];

export function BuildsLayoutClient({
  children,
  rightSidebar,
}: {
  children: ReactNode;
  rightSidebar?: ReactNode;
}) {
  const pathname = usePathname();

  // For slug detail pages (e.g. /builds/altair), skip the PageLayout wrapper
  if (!KNOWN_SUBROUTES.includes(pathname)) {
    return <>{children}</>;
  }

  let title = 'Curated Builds';
  let backHref: string | undefined = undefined;

  if (pathname === '/builds/games') {
    title = 'Entertainment';
    backHref = '/builds';
  } else if (pathname === '/builds/apps') {
    title = 'Apps & Tools';
    backHref = '/builds';
  }

  return (
    <PageLayout
      title={title}
      wide
      backHref={backHref}
      rightSidebar={rightSidebar}
    >
      {children}
    </PageLayout>
  );
}
