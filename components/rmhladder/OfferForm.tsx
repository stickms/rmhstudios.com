/**
 * Record or edit an offer (sprint 03, feature 17). Amounts are typed in the
 * currency's major units and sent as minor-unit strings.
 */
import {
  useState,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  recordOfferApi,
  updateOfferApi,
} from '@/lib/rmhladder/offers.contract';
import {
  CURRENCY_CODES,
  MAX_MINOR_UNITS,
  decimalToMinor,
  minorToDecimal,
  offerProblems,
  type OfferDto,
  type OfferPayPeriod,
  type OfferProblem,
  type OfferRemote,
} from '@/lib/rmhladder/offers';

export interface OfferTarget {
  applicationId: string;
  company: string;
  title: string;
}

type BonusKind =
  | 'none'
  | 'amount'
  | 'percent';

interface FormState {
  currency: string;
  basePay: string;
  payPeriod: OfferPayPeriod;
  hoursPerWeek: string;
  bonusKind: BonusKind;
  bonusValue: string;
  signOn: string;
  equityGrant: string;
  equityYears: string;
  equityNote: string;
  location: string;
  remote:
    | ''
    | OfferRemote;
  ptoDays: string;
  startDate: string;
  deadline: string;
  notes: string;
}

function initialState(
  offer:
    | OfferDto
    | undefined,
): FormState {
  if (
    !offer
  ) {
    return {
      currency:
        'USD',
      basePay:
        '',
      payPeriod:
        'year',
      hoursPerWeek:
        '',
      bonusKind:
        'none',
      bonusValue:
        '',
      signOn:
        '',
      equityGrant:
        '',
      equityYears:
        '',
      equityNote:
        '',
      location:
        '',
      remote:
        '',
      ptoDays:
        '',
      startDate:
        '',
      deadline:
        '',
      notes:
        '',
    };
  }
  const money =
    (
      value:
        | string
        | null,
    ) =>
      value ===
      null
        ? ''
        : minorToDecimal(
            value,
            offer.currency,
          );
  return {
    currency:
      offer.currency,
    basePay:
      money(
        offer.basePay,
      ),
    payPeriod:
      offer.payPeriod,
    hoursPerWeek:
      offer.hoursPerWeek ===
      null
        ? ''
        : String(
            offer.hoursPerWeek,
          ),
    bonusKind:
      offer.bonusAmount !==
      null
        ? 'amount'
        : offer.bonusPercent !==
            null
          ? 'percent'
          : 'none',
    bonusValue:
      offer.bonusAmount !==
      null
        ? money(
            offer.bonusAmount,
          )
        : (
            offer.bonusPercent ??
            ''
          ).toString(),
    signOn:
      money(
        offer.signOn,
      ),
    equityGrant:
      money(
        offer.equityGrant,
      ),
    equityYears:
      offer.equityYears ===
      null
        ? ''
        : String(
            offer.equityYears,
          ),
    equityNote:
      offer.equityNote ??
      '',
    location:
      offer.location ??
      '',
    remote:
      offer.remote ??
      '',
    ptoDays:
      offer.ptoDays ===
      null
        ? ''
        : String(
            offer.ptoDays,
          ),
    startDate:
      offer.startDate ??
      '',
    deadline:
      offer.deadline ??
      '',
    notes:
      offer.notes ??
      '',
  };
}

/** The request body, or the field that is wrong. */
function buildBody(
  form: FormState,
):
  | {
      ok: true;
      body: ReturnType<
        typeof bodyOf
      >;
    }
  | {
      ok: false;
      field: string;
      problem?: OfferProblem;
    } {
  const money =
    (
      text: string,
    ):
      | number
      | null
      | undefined => {
      if (
        !text.trim()
      )
        return null;
      const n =
        decimalToMinor(
          text,
          form.currency,
        );
      return n ===
        null ||
        n >
          MAX_MINOR_UNITS
        ? undefined
        : n;
    };
  const whole =
    (
      text: string,
    ):
      | number
      | null
      | undefined => {
      if (
        !text.trim()
      )
        return null;
      return /^\d{1,4}$/.test(
        text.trim(),
      )
        ? Number(
            text.trim(),
          )
        : undefined;
    };
  const base =
    money(
      form.basePay,
    );
  if (
    base ===
      null ||
    base ===
      undefined
  )
    return {
      ok: false,
      field:
        'basePay',
    };
  const hours =
    whole(
      form.hoursPerWeek,
    );
  if (
    hours ===
      undefined ||
    (hours !==
      null &&
      (hours <
        1 ||
        hours >
          168))
  )
    return {
      ok: false,
      field:
        'hoursPerWeek',
    };
  const bonusAmount =
    form.bonusKind ===
    'amount'
      ? money(
          form.bonusValue,
        )
      : null;
  const bonusPercent =
    form.bonusKind ===
    'percent'
      ? whole(
          form.bonusValue,
        )
      : null;
  if (
    bonusAmount ===
      undefined ||
    (form.bonusKind ===
      'amount' &&
      bonusAmount ===
        null)
  )
    return {
      ok: false,
      field:
        'bonusValue',
    };
  if (
    bonusPercent ===
      undefined ||
    (form.bonusKind ===
      'percent' &&
      (bonusPercent ===
        null ||
        bonusPercent >
          1000))
  )
    return {
      ok: false,
      field:
        'bonusValue',
    };
  const signOn =
    money(
      form.signOn,
    );
  if (
    signOn ===
    undefined
  )
    return {
      ok: false,
      field:
        'signOn',
    };
  const equityGrant =
    money(
      form.equityGrant,
    );
  if (
    equityGrant ===
    undefined
  )
    return {
      ok: false,
      field:
        'equityGrant',
    };
  const equityYears =
    whole(
      form.equityYears,
    );
  if (
    equityYears ===
      undefined ||
    (equityYears !==
      null &&
      (equityYears <
        1 ||
        equityYears >
          20))
  )
    return {
      ok: false,
      field:
        'equityYears',
    };
  const pto =
    whole(
      form.ptoDays,
    );
  if (
    pto ===
      undefined ||
    (pto !==
      null &&
      pto >
        365)
  )
    return {
      ok: false,
      field:
        'ptoDays',
    };

  const amounts =
    {
      payPeriod:
        form.payPeriod,
      hoursPerWeek:
        form.payPeriod ===
        'hour'
          ? hours
          : null,
      bonusAmount:
        bonusAmount ===
        null
          ? null
          : String(
              bonusAmount,
            ),
      bonusPercent,
      equityGrant:
        equityGrant ===
        null
          ? null
          : String(
              equityGrant,
            ),
      equityYears,
    };
  const [
    problem,
  ] =
    offerProblems(
      amounts,
    );
  if (
    problem
  ) {
    const field =
      problem ===
      'hoursRequired'
        ? 'hoursPerWeek'
        : problem ===
            'bonusBoth'
          ? 'bonusValue'
          : 'equityGrant';
    return {
      ok: false,
      field,
      problem,
    };
  }
  return {
    ok: true,
    body: bodyOf(
      form,
      base,
      amounts,
      signOn,
    ),
  };
}

function bodyOf(
  form: FormState,
  base: number,
  amounts: {
    payPeriod: OfferPayPeriod;
    hoursPerWeek:
      | number
      | null;
    bonusAmount:
      | string
      | null;
    bonusPercent:
      | number
      | null;
    equityGrant:
      | string
      | null;
    equityYears:
      | number
      | null;
  },
  signOn:
    | number
    | null,
) {
  const text =
    (
      value: string,
    ) =>
      value.trim() ||
      null;
  return {
    currency:
      form.currency as (typeof CURRENCY_CODES)[number],
    basePay:
      String(
        base,
      ),
    ...amounts,
    signOn:
      signOn ===
      null
        ? null
        : String(
            signOn,
          ),
    equityNote:
      text(
        form.equityNote,
      ),
    location:
      text(
        form.location,
      ),
    remote:
      form.remote ===
      ''
        ? null
        : form.remote,
    ptoDays:
      form.ptoDays.trim()
        ? Number(
            form.ptoDays.trim(),
          )
        : null,
    startDate:
      form.startDate ||
      null,
    deadline:
      form.deadline ||
      null,
    notes:
      text(
        form.notes,
      ),
  };
}

export function OfferForm({
  open,
  onOpenChange,
  target,
  offer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (
    open: boolean,
  ) => void;
  /** The application a new offer is recorded on (ignored when editing). */
  target?: OfferTarget;
  /** Set to edit this offer instead of recording a new one. */
  offer?: OfferDto;
  onSaved: (
    offer: OfferDto,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'ladder-offers',
    );
  const [
    form,
    setForm,
  ] =
    useState<FormState>(
      () =>
        initialState(
          offer,
        ),
    );
  const [
    errorField,
    setErrorField,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    errorText,
    setErrorText,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const company =
    offer?.company ??
    target?.company ??
    '';
  const title =
    offer?.title ??
    target?.title ??
    '';
  const set =
    <
      K extends
        keyof FormState,
    >(
      key: K,
      value: FormState[K],
    ) =>
      setForm(
        (
          current,
        ) => ({
          ...current,
          [key]:
            value,
        }),
      );

  const fieldMessages: Record<
    string,
    string
  > =
    {
      basePay:
        t(
          'form.errors.basePay',
          {
            defaultValue:
              'Enter the base pay as a number.',
          },
        ),
      hoursPerWeek:
        t(
          'form.errors.hoursPerWeek',
          {
            defaultValue:
              'Enter hours per week, 1 to 168.',
          },
        ),
      bonusValue:
        t(
          'form.errors.bonusValue',
          {
            defaultValue:
              'Enter the bonus as a number.',
          },
        ),
      signOn:
        t(
          'form.errors.signOn',
          {
            defaultValue:
              'Enter the sign-on amount as a number.',
          },
        ),
      equityGrant:
        t(
          'form.errors.equityGrant',
          {
            defaultValue:
              'Enter both the equity grant value and the vesting years, or neither.',
          },
        ),
      equityYears:
        t(
          'form.errors.equityYears',
          {
            defaultValue:
              'Enter vesting years, 1 to 20.',
          },
        ),
      ptoDays:
        t(
          'form.errors.ptoDays',
          {
            defaultValue:
              'Enter paid time off as days, 0 to 365.',
          },
        ),
    };

  async function submit(
    event: FormEvent,
  ) {
    event.preventDefault();
    const built =
      buildBody(
        form,
      );
    if (
      !built.ok
    ) {
      setErrorField(
        built.field,
      );
      setErrorText(
        fieldMessages[
          built
            .field
        ] ??
          null,
      );
      document
        .getElementById(
          `offer-${built.field}`,
        )
        ?.focus();
      return;
    }
    setErrorField(
      null,
    );
    setErrorText(
      null,
    );
    setSaving(
      true,
    );
    try {
      const saved =
        offer
          ? await api(
              updateOfferApi,
              {
                params:
                  {
                    id: offer.id,
                  },
                body: built.body,
              },
            )
          : await api(
              recordOfferApi,
              {
                body: {
                  applicationId:
                    target!
                      .applicationId,
                  ...built.body,
                },
              },
            );
      toast.success(
        offer
          ? t(
              'form.updated',
              {
                defaultValue:
                  'Offer updated',
              },
            )
          : t(
              'form.recorded',
              {
                defaultValue:
                  'Offer recorded',
              },
            ),
      );
      onSaved(
        saved.offer,
      );
      onOpenChange(
        false,
      );
    } catch {
      setErrorText(
        t(
          'form.saveFailed',
          {
            defaultValue:
              'Could not save this offer. Try again.',
          },
        ),
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  const invalid =
    (
      field: string,
    ) =>
      errorField ===
      field
        ? true
        : undefined;
  const money =
    (
      id: string,
    ) => ({
      id: `offer-${id}`,
      inputMode:
        'decimal' as const,
      'aria-invalid':
        invalid(
          id,
        ),
    });

  return (
    <Dialog
      open={
        open
      }
      onOpenChange={
        onOpenChange
      }
    >
      <DialogContent
        mobileFullscreen
      >
        <form
          onSubmit={(
            event,
          ) =>
            void submit(
              event,
            )
          }
          className="grid gap-5"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>
              {offer
                ? t(
                    'form.editTitle',
                    {
                      defaultValue:
                        'Edit the offer',
                    },
                  )
                : t(
                    'form.recordTitle',
                    {
                      defaultValue:
                        'Record the offer',
                    },
                  )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'form.description',
                {
                  defaultValue:
                    '{{role}} at {{company}}. Amounts are in the currency you pick.',
                  role: title,
                  company,
                },
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="offer-currency">
                {t(
                  'form.currency',
                  {
                    defaultValue:
                      'Currency',
                  },
                )}
              </Label>
              <Select
                id="offer-currency"
                value={
                  form.currency
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'currency',
                    e
                      .target
                      .value,
                  )
                }
              >
                {CURRENCY_CODES.map(
                  (
                    code,
                  ) => (
                    <option
                      key={
                        code
                      }
                      value={
                        code
                      }
                    >
                      {
                        code
                      }
                    </option>
                  ),
                )}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-payPeriod">
                {t(
                  'form.payPeriod',
                  {
                    defaultValue:
                      'Paid per',
                  },
                )}
              </Label>
              <Select
                id="offer-payPeriod"
                value={
                  form.payPeriod
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'payPeriod',
                    e
                      .target
                      .value as OfferPayPeriod,
                  )
                }
              >
                <option value="year">
                  {t(
                    'period.year',
                    {
                      defaultValue:
                        'Year',
                    },
                  )}
                </option>
                <option value="month">
                  {t(
                    'period.month',
                    {
                      defaultValue:
                        'Month',
                    },
                  )}
                </option>
                <option value="hour">
                  {t(
                    'period.hour',
                    {
                      defaultValue:
                        'Hour',
                    },
                  )}
                </option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-basePay">
                {t(
                  'form.basePay',
                  {
                    defaultValue:
                      'Base salary',
                  },
                )}
              </Label>
              <Input
                {...money(
                  'basePay',
                )}
                value={
                  form.basePay
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'basePay',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            {form.payPeriod ===
              'hour' && (
              <div className="space-y-2">
                <Label htmlFor="offer-hoursPerWeek">
                  {t(
                    'form.hoursPerWeek',
                    {
                      defaultValue:
                        'Hours per week',
                    },
                  )}
                </Label>
                <Input
                  id="offer-hoursPerWeek"
                  inputMode="numeric"
                  aria-invalid={invalid(
                    'hoursPerWeek',
                  )}
                  value={
                    form.hoursPerWeek
                  }
                  onChange={(
                    e,
                  ) =>
                    set(
                      'hoursPerWeek',
                      e
                        .target
                        .value,
                    )
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="offer-bonusKind">
                {t(
                  'form.bonusKind',
                  {
                    defaultValue:
                      'Target bonus',
                  },
                )}
              </Label>
              <Select
                id="offer-bonusKind"
                value={
                  form.bonusKind
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'bonusKind',
                    e
                      .target
                      .value as BonusKind,
                  )
                }
              >
                <option value="none">
                  {t(
                    'form.bonusNone',
                    {
                      defaultValue:
                        'No bonus',
                    },
                  )}
                </option>
                <option value="amount">
                  {t(
                    'form.bonusAmount',
                    {
                      defaultValue:
                        'An amount per year',
                    },
                  )}
                </option>
                <option value="percent">
                  {t(
                    'form.bonusPercent',
                    {
                      defaultValue:
                        'A percent of base',
                    },
                  )}
                </option>
              </Select>
            </div>
            {form.bonusKind !==
              'none' && (
              <div className="space-y-2">
                <Label htmlFor="offer-bonusValue">
                  {form.bonusKind ===
                  'percent'
                    ? t(
                        'form.bonusPercentValue',
                        {
                          defaultValue:
                            'Bonus, percent of base',
                        },
                      )
                    : t(
                        'form.bonusAmountValue',
                        {
                          defaultValue:
                            'Bonus per year',
                        },
                      )}
                </Label>
                <Input
                  {...money(
                    'bonusValue',
                  )}
                  value={
                    form.bonusValue
                  }
                  onChange={(
                    e,
                  ) =>
                    set(
                      'bonusValue',
                      e
                        .target
                        .value,
                    )
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="offer-signOn">
                {t(
                  'form.signOn',
                  {
                    defaultValue:
                      'Sign-on bonus',
                  },
                )}
              </Label>
              <Input
                {...money(
                  'signOn',
                )}
                value={
                  form.signOn
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'signOn',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-equityGrant">
                {t(
                  'form.equityGrant',
                  {
                    defaultValue:
                      'Equity grant value',
                  },
                )}
              </Label>
              <Input
                {...money(
                  'equityGrant',
                )}
                value={
                  form.equityGrant
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'equityGrant',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-equityYears">
                {t(
                  'form.equityYears',
                  {
                    defaultValue:
                      'Vesting years',
                  },
                )}
              </Label>
              <Input
                id="offer-equityYears"
                inputMode="numeric"
                aria-invalid={invalid(
                  'equityYears',
                )}
                value={
                  form.equityYears
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'equityYears',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="offer-equityNote">
                {t(
                  'form.equityNote',
                  {
                    defaultValue:
                      'Equity note (cliff, refreshers)',
                  },
                )}
              </Label>
              <Input
                id="offer-equityNote"
                maxLength={
                  300
                }
                value={
                  form.equityNote
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'equityNote',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-location">
                {t(
                  'form.location',
                  {
                    defaultValue:
                      'Location',
                  },
                )}
              </Label>
              <Input
                id="offer-location"
                maxLength={
                  120
                }
                value={
                  form.location
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'location',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-remote">
                {t(
                  'form.remote',
                  {
                    defaultValue:
                      'Work setup',
                  },
                )}
              </Label>
              <Select
                id="offer-remote"
                value={
                  form.remote
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'remote',
                    e
                      .target
                      .value as FormState['remote'],
                  )
                }
              >
                <option value="">
                  {t(
                    'form.notStated',
                    {
                      defaultValue:
                        'Not stated',
                    },
                  )}
                </option>
                <option value="onsite">
                  {t(
                    'remote.onsite',
                    {
                      defaultValue:
                        'On-site',
                    },
                  )}
                </option>
                <option value="hybrid">
                  {t(
                    'remote.hybrid',
                    {
                      defaultValue:
                        'Hybrid',
                    },
                  )}
                </option>
                <option value="remote">
                  {t(
                    'remote.remote',
                    {
                      defaultValue:
                        'Remote',
                    },
                  )}
                </option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-ptoDays">
                {t(
                  'form.ptoDays',
                  {
                    defaultValue:
                      'Paid time off, days',
                  },
                )}
              </Label>
              <Input
                id="offer-ptoDays"
                inputMode="numeric"
                aria-invalid={invalid(
                  'ptoDays',
                )}
                value={
                  form.ptoDays
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'ptoDays',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-startDate">
                {t(
                  'form.startDate',
                  {
                    defaultValue:
                      'Start date',
                  },
                )}
              </Label>
              <Input
                id="offer-startDate"
                type="date"
                value={
                  form.startDate
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'startDate',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-deadline">
                {t(
                  'form.deadline',
                  {
                    defaultValue:
                      'Decision deadline',
                  },
                )}
              </Label>
              <Input
                id="offer-deadline"
                type="date"
                value={
                  form.deadline
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'deadline',
                    e
                      .target
                      .value,
                  )
                }
              />
              <p className="t-meta">
                {t(
                  'form.deadlineHint',
                  {
                    defaultValue:
                      'A follow-up reminder is set for the day before.',
                  },
                )}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="offer-notes">
                {t(
                  'form.notes',
                  {
                    defaultValue:
                      'Notes',
                  },
                )}
              </Label>
              <Textarea
                id="offer-notes"
                rows={
                  3
                }
                maxLength={
                  2000
                }
                value={
                  form.notes
                }
                onChange={(
                  e,
                ) =>
                  set(
                    'notes',
                    e
                      .target
                      .value,
                  )
                }
              />
            </div>
          </div>

          {errorText && (
            <p
              role="alert"
              className="t-body text-site-danger"
            >
              {
                errorText
              }
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="default"
              onClick={() =>
                onOpenChange(
                  false,
                )
              }
            >
              {t(
                'form.cancel',
                {
                  defaultValue:
                    'Cancel',
                },
              )}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={
                saving
              }
              loadingText={t(
                'form.saving',
                {
                  defaultValue:
                    'Saving…',
                },
              )}
            >
              {t(
                'form.save',
                {
                  defaultValue:
                    'Save offer',
                },
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
