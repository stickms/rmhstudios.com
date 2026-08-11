import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * `/sohumbum2/<date>` — the old per-day permalink, redirected to its new home.
 *
 * The day is carried through: these are exactly the links that were worth
 * sharing, so dropping the date and landing on the front page would lose the
 * only thing the link was for.
 */
export const Route = createFileRoute('/sohumbum2/$date')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/sohumtracker/$date', params: { date: params.date }, replace: true });
  },
});
