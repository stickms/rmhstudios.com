import type { ComponentType, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

/**
 * The one link to a school's page. `/rmh-medschool/$slug` is a route of the school page (plan Task 9); until that
 * route file exists the router's generated types do not know the path, so the link is typed loosely here and
 * nowhere else. Once the route exists this is a plain `<Link to="/rmh-medschool/$slug" params={{ slug }} />`.
 */
const SchoolRouteLink = Link as unknown as ComponentType<{
  to: string;
  params: { slug: string };
  className?: string | undefined;
  children: ReactNode;
}>;

export function SchoolLink({ slug, className, children }: { slug: string; className?: string; children: ReactNode }) {
  return (
    <SchoolRouteLink to="/rmh-medschool/$slug" params={{ slug }} className={className}>
      {children}
    </SchoolRouteLink>
  );
}
