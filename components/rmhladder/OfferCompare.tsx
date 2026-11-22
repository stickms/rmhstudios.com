/**
 * The side-by-side comparison of offers (sprint 03, feature 17): a real table
 * on wide screens (offer = column header, field = row header), a stacked list
 * per offer on phones. "Highest" is text, marked per currency; nothing is
 * converted between currencies.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { decideOfferApi, deleteOfferApi } from '@/lib/rmhladder/offers.contract';
import {
  currencyDigits,
  formatDay,
  formatMinor,
  highestPerCurrency,
  offerTotals,
  type OfferDto,
  type OpenApplication,
} from '@/lib/rmhladder/offers';

interface Row {
  id: string;
  label: string;
  cell: (offer: OfferDto) => ReactNode;
}

export function OfferCompare({
  offers,
  openApplications,
  onEdit,
  onChanged,
}: {
  offers: OfferDto[];
  openApplications: OpenApplication[];
  onEdit: (offer: OfferDto) => void;
  /** Called after any change made here, so the page reloads its data. */
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation('ladder-offers');
  const confirm = useConfirm();
  const locale = i18n.language;
  const [accepting, setAccepting] = useState<OfferDto | null>(null);
  const highest = highestPerCurrency(offers);
  const currencies = new Set(offers.map((offer) => offer.currency));

  const money = (value: string | number, currency: string) => formatMinor(value, currency, locale);
  const none = (
    <span
      aria-label={t('compare.notStated', {
        defaultValue: 'Not stated',
      })}
    >
      —
    </span>
  );
  const period = (offer: OfferDto) =>
    offer.payPeriod === 'hour'
      ? t('compare.perHour', {
          defaultValue: 'per hour',
        })
      : offer.payPeriod === 'month'
        ? t('compare.perMonth', {
            defaultValue: 'per month',
          })
        : t('compare.perYear', {
            defaultValue: 'per year',
          });
  const highestMark = (on: boolean) =>
    on ? (
      <span className="t-label ml-2 text-site-text">
        {t('compare.highest', {
          defaultValue: 'Highest',
        })}
      </span>
    ) : null;

  const rows: Row[] = [
    {
      id: 'state',
      label: t('compare.state', {
        defaultValue: 'Status',
      }),
      cell: (o) =>
        o.state === 'accepted'
          ? t('compare.accepted', {
              defaultValue: 'Accepted',
            })
          : o.state === 'declined'
            ? t('compare.declined', {
                defaultValue: 'Declined',
              })
            : t('compare.open', {
                defaultValue: 'Open',
              }),
    },
    {
      id: 'base',
      label: t('compare.base', {
        defaultValue: 'Base salary',
      }),
      cell: (o) => {
        const last = o.revisions[o.revisions.length - 1];
        return (
          <>
            <span>
              {money(o.basePay, o.currency)} {period(o)}
            </span>
            {o.payPeriod === 'hour' && o.hoursPerWeek ? (
              <span className="t-meta block">
                {t('compare.hours', {
                  defaultValue_one: '{{count}} hour a week',
                  defaultValue: '{{count}} hours a week',
                  count: o.hoursPerWeek,
                })}
              </span>
            ) : null}
            {o.postingPay ? (
              <span className="t-meta block">
                {t('compare.posting', {
                  defaultValue: 'Posting: {{min}} to {{max}} per year',
                  min: money(o.postingPay.min * 10 ** currencyDigits(o.postingPay.currency), o.postingPay.currency),
                  max: money(o.postingPay.max * 10 ** currencyDigits(o.postingPay.currency), o.postingPay.currency),
                })}
              </span>
            ) : null}
            {last ? (
              <span className="t-meta block">
                {t('compare.revised', {
                  defaultValue: 'Revised on {{date}}, base was {{amount}} {{period}}',
                  date: formatDay(last.at.slice(0, 10), locale),
                  amount: money(last.previous.basePay, last.previous.currency),
                  period:
                    last.previous.payPeriod === 'hour'
                      ? t('compare.perHour', {
                          defaultValue: 'per hour',
                        })
                      : last.previous.payPeriod === 'month'
                        ? t('compare.perMonth', {
                            defaultValue: 'per month',
                          })
                        : t('compare.perYear', {
                            defaultValue: 'per year',
                          }),
                })}
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'annualBase',
      label: t('compare.annualBase', {
        defaultValue: 'Base for a year',
      }),
      cell: (o) => money(offerTotals(o).annualBase, o.currency),
    },
    {
      id: 'bonus',
      label: t('compare.bonus', {
        defaultValue: 'Target bonus',
      }),
      cell: (o) => {
        const totals = offerTotals(o);
        if (o.bonusAmount === null && o.bonusPercent === null) return none;
        return (
          <>
            {money(totals.bonus, o.currency)}
            {o.bonusPercent !== null ? (
              <span className="t-meta block">
                {t('compare.bonusPercent', {
                  defaultValue: '{{percent}}% of base',
                  percent: o.bonusPercent,
                })}
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'signOn',
      label: t('compare.signOn', {
        defaultValue: 'Sign-on',
      }),
      cell: (o) => (o.signOn === null ? none : money(o.signOn, o.currency)),
    },
    {
      id: 'equity',
      label: t('compare.equity', {
        defaultValue: 'Equity per year',
      }),
      cell: (o) => {
        if (o.equityGrant === null || o.equityYears === null) return none;
        return (
          <>
            {money(offerTotals(o).equityPerYear, o.currency)}
            <span className="t-meta block">
              {t('compare.equityGrant', {
                defaultValue_one: '{{grant}} over {{count}} year',
                defaultValue: '{{grant}} over {{count}} years',
                grant: money(o.equityGrant, o.currency),
                count: o.equityYears,
              })}
            </span>
            {o.equityNote ? <span className="t-meta block">{o.equityNote}</span> : null}
          </>
        );
      },
    },
    {
      id: 'firstYear',
      label: t('compare.firstYear', {
        defaultValue: 'First-year total',
      }),
      cell: (o) => (
        <span className="font-semibold">
          {money(offerTotals(o).firstYear, o.currency)}
          {highestMark(highest.firstYear.has(o.id))}
        </span>
      ),
    },
    {
      id: 'yearly',
      label: t('compare.yearly', {
        defaultValue: 'Yearly total after year one',
      }),
      cell: (o) => (
        <span className="font-semibold">
          {money(offerTotals(o).yearly, o.currency)}
          {highestMark(highest.yearly.has(o.id))}
        </span>
      ),
    },
    {
      id: 'location',
      label: t('compare.location', {
        defaultValue: 'Location',
      }),
      cell: (o) => o.location ?? none,
    },
    {
      id: 'remote',
      label: t('compare.remote', {
        defaultValue: 'Work setup',
      }),
      cell: (o) =>
        o.remote === 'onsite'
          ? t('remote.onsite', {
              defaultValue: 'On-site',
            })
          : o.remote === 'hybrid'
            ? t('remote.hybrid', {
                defaultValue: 'Hybrid',
              })
            : o.remote === 'remote'
              ? t('remote.remote', {
                  defaultValue: 'Remote',
                })
              : none,
    },
    {
      id: 'pto',
      label: t('compare.pto', {
        defaultValue: 'Paid time off',
      }),
      cell: (o) =>
        o.ptoDays === null
          ? none
          : t('compare.ptoDays', {
              defaultValue_one: '{{count}} day',
              defaultValue: '{{count}} days',
              count: o.ptoDays,
            }),
    },
    {
      id: 'start',
      label: t('compare.start', {
        defaultValue: 'Start date',
      }),
      cell: (o) => (o.startDate ? formatDay(o.startDate, locale) : none),
    },
    {
      id: 'deadline',
      label: t('compare.deadline', {
        defaultValue: 'Decision deadline',
      }),
      cell: (o) => (o.deadline ? formatDay(o.deadline, locale) : none),
    },
    {
      id: 'notes',
      label: t('compare.notes', {
        defaultValue: 'Notes',
      }),
      cell: (o) => (o.notes ? <span className="whitespace-pre-wrap">{o.notes}</span> : none),
    },
  ];

  async function remove(offer: OfferDto) {
    const ok = await confirm({
      title: t('compare.deleteTitle', {
        defaultValue: 'Delete this offer?',
      }),
      description: t('compare.deleteBody', {
        defaultValue: 'The offer from {{company}} and its revisions are removed. The application stays.',
        company: offer.company,
      }),
      confirmLabel: t('compare.delete', {
        defaultValue: 'Delete',
      }),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(deleteOfferApi, {
        params: {
          id: offer.id,
        },
      });
      onChanged();
    } catch {
      toast.error(
        t('compare.actionFailed', {
          defaultValue: 'That did not work. Try again.',
        }),
      );
    }
  }

  async function decline(offer: OfferDto) {
    const ok = await confirm({
      title: t('compare.declineTitle', {
        defaultValue: 'Decline this offer?',
      }),
      description: t('compare.declineBody', {
        defaultValue: 'The offer from {{company}} is marked declined and leaves the comparison.',
        company: offer.company,
      }),
      confirmLabel: t('compare.decline', {
        defaultValue: 'Decline',
      }),
    });
    if (!ok) return;
    try {
      await api(decideOfferApi, {
        params: {
          id: offer.id,
        },
        body: {
          decision: 'decline',
          withdrawApplicationIds: [],
        },
      });
      onChanged();
    } catch {
      toast.error(
        t('compare.actionFailed', {
          defaultValue: 'That did not work. Try again.',
        }),
      );
    }
  }

  const actions = (offer: OfferDto) => (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(offer)}>
        {t('compare.edit', {
          defaultValue: 'Edit',
        })}
      </Button>
      {offer.state === 'open' && (
        <>
          <Button type="button" size="sm" variant="default" onClick={() => setAccepting(offer)}>
            {t('compare.accept', {
              defaultValue: 'Accept',
            })}
          </Button>
          <Button type="button" size="sm" variant="default" onClick={() => void decline(offer)}>
            {t('compare.decline', {
              defaultValue: 'Decline',
            })}
          </Button>
        </>
      )}
      <Button type="button" size="sm" variant="ghost" onClick={() => void remove(offer)}>
        {t('compare.delete', {
          defaultValue: 'Delete',
        })}
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      {currencies.size > 1 && (
        <p className="t-meta">
          {t('compare.currencies', {
            defaultValue:
              'These offers are in different currencies. They are compared within each currency; nothing is converted.',
          })}
        </p>
      )}

      <div
        className="hidden overflow-x-auto md:block"
        role="region"
        tabIndex={0}
        aria-label={t('compare.region', {
          defaultValue: 'Offer comparison',
        })}
      >
        <table className="w-full min-w-max border-collapse text-left">
          <caption className="sr-only">
            {t('compare.caption', {
              defaultValue: 'Offers side by side, one column per offer',
            })}
          </caption>
          <thead>
            <tr className="border-b border-site-border align-bottom">
              <th scope="col" className="w-40 py-3 pr-4">
                <span className="sr-only">
                  {t('compare.field', {
                    defaultValue: 'Field',
                  })}
                </span>
              </th>
              {offers.map((offer) => (
                <th key={offer.id} scope="col" className="min-w-44 py-3 pr-4 align-bottom">
                  <span className="t-heading block">{offer.company}</span>
                  <span className="t-body block font-normal text-site-text-muted">{offer.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-site-border align-top">
                <th scope="row" className="t-label py-3 pr-4">
                  {row.label}
                </th>
                {offers.map((offer) => (
                  <td key={offer.id} className="t-body py-3 pr-4">
                    {row.cell(offer)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="align-top">
              <th scope="row" className="py-3 pr-4">
                <span className="sr-only">
                  {t('compare.actions', {
                    defaultValue: 'Actions',
                  })}
                </span>
              </th>
              {offers.map((offer) => (
                <td key={offer.id} className="py-3 pr-4">
                  {actions(offer)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        {offers.map((offer) => (
          <section key={offer.id} aria-labelledby={`offer-h-${offer.id}`} className="border-b border-site-border py-4">
            <h2 id={`offer-h-${offer.id}`} className="t-heading">
              {offer.company}
            </h2>
            <p className="t-body text-site-text-muted">{offer.title}</p>
            <dl className="mt-2">
              {rows.map((row) => (
                <div key={row.id} className="flex gap-3 border-t border-site-border py-2">
                  <dt className="t-label w-32 shrink-0">{row.label}</dt>
                  <dd className="t-body m-0 min-w-0 flex-1">{row.cell(offer)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2">{actions(offer)}</div>
          </section>
        ))}
      </div>

      {accepting && (
        <AcceptDialog
          key={accepting.id}
          offer={accepting}
          candidates={openApplications.filter((app) => app.id !== accepting.applicationId)}
          onClose={() => setAccepting(null)}
          onDone={() => {
            setAccepting(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AcceptDialog({
  offer,
  candidates,
  onClose,
  onDone,
}: {
  offer: OfferDto;
  candidates: OpenApplication[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('ladder-offers');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(id: string, on: boolean) {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function accept() {
    setSaving(true);
    try {
      const result = await api(decideOfferApi, {
        params: {
          id: offer.id,
        },
        body: {
          decision: 'accept',
          withdrawApplicationIds: [...ticked],
        },
      });
      toast.success(
        t('accept.done', {
          defaultValue_one: 'Offer accepted. {{count}} application withdrawn.',
          defaultValue: 'Offer accepted. {{count}} applications withdrawn.',
          count: result.withdrawn,
        }),
      );
      onDone();
    } catch {
      toast.error(
        t('compare.actionFailed', {
          defaultValue: 'That did not work. Try again.',
        }),
      );
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('accept.title', {
              defaultValue: 'Accept this offer?',
            })}
          </DialogTitle>
          <DialogDescription>
            {t('accept.description', {
              defaultValue:
                '{{role}} at {{company}}. Tick any other applications to withdraw. Nothing is withdrawn unless you tick it.',
              role: offer.title,
              company: offer.company,
            })}
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('accept.none', {
              defaultValue: 'You have no other open applications.',
            })}
          </p>
        ) : (
          <fieldset className="max-h-64 overflow-y-auto">
            <legend className="t-label pb-2">
              {t('accept.legend', {
                defaultValue: 'Withdraw these applications',
              })}
            </legend>
            {candidates.map((app) => (
              <label key={app.id} className="flex min-h-11 items-center gap-3 border-b border-site-border py-2">
                <input
                  type="checkbox"
                  checked={ticked.has(app.id)}
                  onChange={(event) => toggle(app.id, event.target.checked)}
                />
                <span className="t-body">
                  {app.title}
                  <span className="t-meta block">{app.company}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <DialogFooter>
          <Button type="button" variant="default" onClick={onClose}>
            {t('form.cancel', {
              defaultValue: 'Cancel',
            })}
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            loadingText={t('form.saving', {
              defaultValue: 'Saving…',
            })}
            onClick={() => void accept()}
          >
            {t('accept.confirm', {
              defaultValue: 'Accept offer',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
