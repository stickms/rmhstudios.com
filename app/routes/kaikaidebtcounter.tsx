/**
 * /kaikaidebtcounter — the live, compounding record of what Kaikai owes.
 *
 * Three things happen on this page:
 *
 *  1. **The counter ticks.** Continuously compounded interest on everything on
 *     the books, evaluated in the browser against a scalar basis the server
 *     hands over. Interest is the only growth mechanism — see
 *     `lib/kaikai-debt/debt.ts` for why that factorises into one number.
 *  2. **Anyone signed in can add to it.** DeepSeek appraises the claim, prices
 *     it between $5 and $250, and the line is logged against its author forever.
 *  3. **The log never ends.** Scrolling pages backwards through his history;
 *     past the end of what exists, DeepSeek writes more and it is cached in
 *     Postgres, so each stretch of history is generated once for everyone.
 *
 * Between the counter and the log sits the analytics panel: a dozen interactive
 * charts, a 3D terrain, a 4D projection, a globe and a live credit score, all
 * reading the same aggregates from `/api/kaikai-debt/stats`.
 *
 * ## Why it is a top-level route
 *
 * **Placement decides chrome** (`app/CLAUDE.md`): files under `_site/` get the
 * sidebar shell, top-level files render full-screen. This one is top level
 * because it is a destination rather than a page in a feed — you arrive at it
 * from a link, you read a ledger, and a rail full of somewhere-else is not what
 * that wants. It draws its own header instead: a back link, the title, the sound
 * toggle.
 *
 * Standalone chrome is **not** a licence for a standalone look. Everything on it
 * is `--site-*` — the same surfaces, ink, radii and glass classes as every other
 * page, in all seven themes. (It used to carry a bespoke fire/aura/laser layer
 * in hardcoded flame colours, which is exactly the "looks like a different site"
 * failure design-language.md §0 is about; that is gone.) The one scoped palette
 * left is the chart layer's, because those colours encode data and must not
 * follow the theme — see `components/kaikai-debt/kaikai-debt.css`.
 *
 * The loader renders the snapshot server-side so the first paint already shows a
 * populated counter and the first page of the log — a debt counter that boots at
 * $0.00 and then jumps has told the reader the number is fake.
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { definePage } from '@/lib/route/define-page';
import { KaikaiDebtCounter } from '@/components/kaikai-debt/KaikaiDebtCounter';
import type { DebtSnapshot } from '@/lib/kaikai-debt/debt';
import { getSnapshot } from '@/lib/kaikai-debt/ledger.server';

/**
 * The boot snapshot: the counter's basis plus the first page of the log.
 *
 * In the steady state this is a pure database read — the archive always has
 * thousands of cached rows past page one, so `getLedgerPage`'s generate-ahead
 * check is satisfied and nothing reaches DeepSeek on the render path. The one
 * time it does generate is the first visit to a fresh deployment, where the
 * alternative is server-rendering an empty debt log.
 */
const fetchSnapshot = createServerFn({ method: 'GET' }).handler(async (): Promise<DebtSnapshot> =>
  getSnapshot(),
);

export const Route = createFileRoute('/kaikaidebtcounter')({
  head: definePage({
    path: '/kaikaidebtcounter',
    title: 'The Kaikai Debt Counter | RMH Studios',
    description:
      'A live, compounding, permanently public record of everything Kaikai owes. Anyone can add to it. Nobody can pay it down.',
  }),
  loader: () => fetchSnapshot(),
  component: KaikaiDebtCounterPage,
});

function KaikaiDebtCounterPage() {
  return <KaikaiDebtCounter snapshot={Route.useLoaderData()} />;
}
