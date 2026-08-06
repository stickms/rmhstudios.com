import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Landmark, ShieldCheck } from 'lucide-react';

/**
 * Who issues the paper, who clears the payments, and who works the debt out.
 *
 * The counter above says what Kaikai owes; this says who books it. Both desks
 * sit inside **RMH Capital** — Debt Capital Markets under Investment Banking,
 * and Counterparty Treasury & Risk Management under Treasury Management — and
 * the point of the closing line is that neither runs the workout alone: one
 * prices the paper, the other prices the man behind it, and a restructuring
 * needs both marks.
 *
 * Static prose, deliberately. Nothing here reads the ledger — attaching live
 * numbers to it would put a second subscriber on a stream whose whole design is
 * that one component owns the basis and the odometer is the only thing that
 * repaints (`KaikaiDebtCounter`).
 */
export function DebtDesks() {
  const { t } = useTranslation('c-kaikai-debt');

  return (
    <section
      className="glass-pane flex flex-col gap-3 rounded-site p-4"
      aria-labelledby="kd-desks-title"
    >
      <div className="flex flex-col gap-1">
        <h2 id="kd-desks-title" className="font-display text-lg font-semibold text-site-text">
          {t('desks.title', { defaultValue: 'Who issues it, who settles it' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('desks.ledeCapital', {
            defaultValue:
              'The tab is public, but the paper behind it is not self-issued. Two RMH Capital desks stand between a line in the log and the number at the top of this page.',
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Desk
          icon={Landmark}
          role={t('desks.issuer.role', { defaultValue: 'Investment Banking' })}
          body={t('desks.issuer.body', {
            defaultValue:
              'Structures and issues every instrument written against this balance. Each line on the tab below is originated here, priced at the appraiser’s mark, and placed on the books the moment it clears.',
          })}
          name={
            <Link
              to="/rmh-capital/businesses"
              hash="investment-banking"
              className="text-site-accent underline-offset-4 hover:underline"
            >
              {t('desks.issuer.name', {
                defaultValue: 'RMH Capital — Debt Capital Markets',
              })}
            </Link>
          }
        />
        <Desk
          icon={ShieldCheck}
          role={t('desks.settlement.roleTreasury', { defaultValue: 'Treasury Management' })}
          name={t('desks.settlement.nameCapital', {
            defaultValue: 'RMH Capital — Counterparty Treasury & Risk Management',
          })}
          body={t('desks.settlement.body', {
            defaultValue:
              'Books the repayments and carries the counterparty risk on a borrower whose balance has only ever gone one way. Anything Kaikai pays down settles through this team; so far it has had nothing to settle.',
          })}
        />
      </div>

      <p className="glass-inset rounded-site-sm p-3 text-xs text-site-text-muted">
        {t('desks.workout', {
          defaultValue:
            'Neither desk works this out alone. Debt Capital Markets and Counterparty Treasury run the workout jointly — one marks the paper, the other marks the man behind it, and no restructuring clears without both. Kaikai has not been offered one.',
        })}
      </p>
    </section>
  );
}

function Desk({
  icon: Icon,
  name,
  role,
  body,
}: {
  icon: typeof Landmark;
  name: ReactNode;
  role: string;
  body: string;
}) {
  return (
    <article className="glass-fill flex flex-col gap-1.5 rounded-site p-3">
      <p className="flex items-center gap-1.5 text-xs text-site-text-muted">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {role}
      </p>
      <h3 className="font-display text-sm font-semibold text-balance text-site-text">{name}</h3>
      <p className="text-xs text-site-text-muted">{body}</p>
    </article>
  );
}
