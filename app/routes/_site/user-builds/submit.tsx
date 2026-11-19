import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * `/user-builds/submit` → `/create/builds/submit`.
 *
 * Submitting and managing builds moved under the Create hub's Builds section
 * (2026-11-19). This one stays a route file rather than a LEGACY_REDIRECTS row
 * because it carries `?edit=` (the build being edited) and `?forGame=` (a Steam
 * hub's "make a build for this game") across.
 */
export const Route = createFileRoute('/_site/user-builds/submit')({
  validateSearch: (search: Record<string, unknown>): { edit?: string; forGame?: string } => ({
    ...(typeof search.edit === 'string' ? { edit: search.edit } : {}),
    ...(typeof search.forGame === 'string' ? { forGame: search.forGame } : {}),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/create/builds/submit', search, replace: true });
  },
});
