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
 * A `_site` route, so it keeps the site shell and the `--site-*` theme contract.
 * The fire/aura/laser layer declares its own scoped palette under `.kd-root`
 * (`components/kaikai-debt/kaikai-debt.css`) rather than bending theme tokens
 * into flame colours.
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

export const Route = createFileRoute('/_site/kaikaidebtcounter')({
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
