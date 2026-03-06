import { useLocation } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import type { ReactNode } from 'react';

export function BuildsLayoutClient({
  children,
  rightSidebar,
}: {
  children: ReactNode;
  rightSidebar?: ReactNode;
}) {
  const pathname = useLocation({ select: (loc) => loc.pathname });

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
