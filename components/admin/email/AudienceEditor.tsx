import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { SearchField } from '@/components/ui/search-field';
import { api } from '@/lib/contract/client';
import {
  adminEmailUserSearch,
  type EmailRecipientSummary,
} from '@/lib/admin/email.contract';
import type { AudienceFilters } from '@/lib/email/campaign-schema';

export type AudienceMode =
  | 'all'
  | 'filter'
  | 'manual';

/** The filter form's own state: every field a string, so an empty field means "no filter". */
export interface FilterDraft {
  search: string;
  emailDomain: string;
  joinedAfter: string;
  joinedBefore: string;
  activeWithinDays: string;
  inactiveForDays: string;
  emailVerified:
    | ''
    | 'yes'
    | 'no';
  role:
    | ''
    | 'admins'
    | 'non-admins';
  verifiedBadge:
    | ''
    | 'yes'
    | 'no';
  membership:
    | ''
    | 'members'
    | 'non-members';
  minFollowers: string;
  minPosts: string;
  includeBanned: boolean;
}

export const EMPTY_FILTERS: FilterDraft =
  {
    search:
      '',
    emailDomain:
      '',
    joinedAfter:
      '',
    joinedBefore:
      '',
    activeWithinDays:
      '',
    inactiveForDays:
      '',
    emailVerified:
      '',
    role: '',
    verifiedBadge:
      '',
    membership:
      '',
    minFollowers:
      '',
    minPosts:
      '',
    includeBanned: false,
  };

function positiveInt(
  value: string,
):
  | number
  | undefined {
  const n =
    Number(
      value,
    );
  return value.trim() !==
    '' &&
    Number.isInteger(
      n,
    ) &&
    n >=
      0
    ? n
    : undefined;
}

/** The draft as the API's filters: blank fields dropped. */
export function toFilters(
  d: FilterDraft,
): AudienceFilters {
  const f: AudienceFilters =
    {};
  if (
    d.search.trim()
  )
    f.search =
      d.search.trim();
  if (
    d.emailDomain.trim()
  )
    f.emailDomain =
      d.emailDomain
        .trim()
        .replace(
          /^@/,
          '',
        )
        .toLowerCase();
  if (
    d.joinedAfter
  )
    f.joinedAfter =
      d.joinedAfter;
  if (
    d.joinedBefore
  )
    f.joinedBefore =
      d.joinedBefore;
  const active =
    positiveInt(
      d.activeWithinDays,
    );
  if (
    active
  )
    f.activeWithinDays =
      active;
  const inactive =
    positiveInt(
      d.inactiveForDays,
    );
  if (
    inactive
  )
    f.inactiveForDays =
      inactive;
  if (
    d.emailVerified
  )
    f.emailVerified =
      d.emailVerified ===
      'yes';
  if (
    d.role
  )
    f.role =
      d.role;
  if (
    d.verifiedBadge
  )
    f.verifiedBadge =
      d.verifiedBadge;
  if (
    d.membership
  )
    f.membership =
      d.membership;
  const followers =
    positiveInt(
      d.minFollowers,
    );
  if (
    followers
  )
    f.minFollowers =
      followers;
  const posts =
    positiveInt(
      d.minPosts,
    );
  if (
    posts
  )
    f.minPosts =
      posts;
  if (
    d.includeBanned
  )
    f.includeBanned = true;
  return f;
}

export function recipientName(
  u: Pick<
    EmailRecipientSummary,
    | 'name'
    | 'handle'
    | 'email'
  >,
): string {
  return (
    u.name ||
    (u.handle
      ? `@${u.handle}`
      : null) ||
    u.email ||
    ''
  );
}

interface Props {
  mode: AudienceMode;
  onModeChange: (
    mode: AudienceMode,
  ) => void;
  filters: FilterDraft;
  onFiltersChange: (
    filters: FilterDraft,
  ) => void;
  selected: EmailRecipientSummary[];
  onSelectedChange: (
    selected: EmailRecipientSummary[],
  ) => void;
}

/** Who a campaign goes to: everyone, a filtered set, or people picked by hand. */
export function AudienceEditor(
  props: Props,
) {
  const {
    t,
  } =
    useTranslation(
      'admin',
    );
  return (
    <div className="space-y-4">
      <Tabs
        aria-label={t(
          'email-audience',
          {
            defaultValue:
              'Audience',
          },
        )}
        value={
          props.mode
        }
        onChange={(
          id,
        ) =>
          props.onModeChange(
            id as AudienceMode,
          )
        }
        tabs={[
          {
            id: 'all',
            label:
              t(
                'email-audience-all',
                {
                  defaultValue:
                    'All users',
                },
              ),
          },
          {
            id: 'filter',
            label:
              t(
                'email-audience-filter',
                {
                  defaultValue:
                    'Filter',
                },
              ),
          },
          {
            id: 'manual',
            label:
              t(
                'email-audience-manual',
                {
                  defaultValue:
                    'Choose people',
                },
              ),
          },
        ]}
      />
      {props.mode ===
      'all' ? (
        <p className="t-body text-site-text-muted">
          {t(
            'email-audience-all-desc',
            {
              defaultValue:
                'Every account with an email address. Bots, banned accounts and people who opted out of this type of email are left out.',
            },
          )}
        </p>
      ) : null}
      {props.mode ===
      'filter' ? (
        <FilterForm
          value={
            props.filters
          }
          onChange={
            props.onFiltersChange
          }
        />
      ) : null}
      {props.mode ===
      'manual' ? (
        <ManualPicker
          selected={
            props.selected
          }
          onChange={
            props.onSelectedChange
          }
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="t-label">
        {
          label
        }
      </span>
      {
        children
      }
    </label>
  );
}

function FilterForm({
  value,
  onChange,
}: {
  value: FilterDraft;
  onChange: (
    next: FilterDraft,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin',
    );
  const set =
    <
      K extends
        keyof FilterDraft,
    >(
      key: K,
      v: FilterDraft[K],
    ) =>
      onChange(
        {
          ...value,
          [key]:
            v,
        },
      );
  const any =
    t(
      'email-filter-any',
      {
        defaultValue:
          'Any',
      },
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label={t(
            'email-filter-search',
            {
              defaultValue:
                'Name, handle or email contains',
            },
          )}
        >
          <Input
            value={
              value.search
            }
            maxLength={
              100
            }
            onChange={(
              e,
            ) =>
              set(
                'search',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-domain',
            {
              defaultValue:
                'Email domain',
            },
          )}
        >
          <Input
            value={
              value.emailDomain
            }
            placeholder="example.com"
            maxLength={
              100
            }
            onChange={(
              e,
            ) =>
              set(
                'emailDomain',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-joined-after',
            {
              defaultValue:
                'Joined on or after',
            },
          )}
        >
          <Input
            type="date"
            value={
              value.joinedAfter
            }
            onChange={(
              e,
            ) =>
              set(
                'joinedAfter',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-joined-before',
            {
              defaultValue:
                'Joined on or before',
            },
          )}
        >
          <Input
            type="date"
            value={
              value.joinedBefore
            }
            onChange={(
              e,
            ) =>
              set(
                'joinedBefore',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-active',
            {
              defaultValue:
                'Active in the last (days)',
            },
          )}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={
              1
            }
            value={
              value.activeWithinDays
            }
            onChange={(
              e,
            ) =>
              set(
                'activeWithinDays',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-inactive',
            {
              defaultValue:
                'Not seen for at least (days)',
            },
          )}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={
              1
            }
            value={
              value.inactiveForDays
            }
            onChange={(
              e,
            ) =>
              set(
                'inactiveForDays',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-membership',
            {
              defaultValue:
                'Membership',
            },
          )}
        >
          <Select
            value={
              value.membership
            }
            onChange={(
              e,
            ) =>
              set(
                'membership',
                e
                  .target
                  .value as FilterDraft['membership'],
              )
            }
          >
            <option value="">
              {
                any
              }
            </option>
            <option value="members">
              {t(
                'email-filter-members',
                {
                  defaultValue:
                    'Members',
                },
              )}
            </option>
            <option value="non-members">
              {t(
                'email-filter-non-members',
                {
                  defaultValue:
                    'Not members',
                },
              )}
            </option>
          </Select>
        </Field>
        <Field
          label={t(
            'email-filter-role',
            {
              defaultValue:
                'Role',
            },
          )}
        >
          <Select
            value={
              value.role
            }
            onChange={(
              e,
            ) =>
              set(
                'role',
                e
                  .target
                  .value as FilterDraft['role'],
              )
            }
          >
            <option value="">
              {
                any
              }
            </option>
            <option value="admins">
              {t(
                'email-filter-admins',
                {
                  defaultValue:
                    'Admins',
                },
              )}
            </option>
            <option value="non-admins">
              {t(
                'email-filter-non-admins',
                {
                  defaultValue:
                    'Not admins',
                },
              )}
            </option>
          </Select>
        </Field>
        <Field
          label={t(
            'email-filter-verified-badge',
            {
              defaultValue:
                'Verified badge',
            },
          )}
        >
          <Select
            value={
              value.verifiedBadge
            }
            onChange={(
              e,
            ) =>
              set(
                'verifiedBadge',
                e
                  .target
                  .value as FilterDraft['verifiedBadge'],
              )
            }
          >
            <option value="">
              {
                any
              }
            </option>
            <option value="yes">
              {t(
                'email-filter-yes',
                {
                  defaultValue:
                    'Yes',
                },
              )}
            </option>
            <option value="no">
              {t(
                'email-filter-no',
                {
                  defaultValue:
                    'No',
                },
              )}
            </option>
          </Select>
        </Field>
        <Field
          label={t(
            'email-filter-email-verified',
            {
              defaultValue:
                'Email address confirmed',
            },
          )}
        >
          <Select
            value={
              value.emailVerified
            }
            onChange={(
              e,
            ) =>
              set(
                'emailVerified',
                e
                  .target
                  .value as FilterDraft['emailVerified'],
              )
            }
          >
            <option value="">
              {
                any
              }
            </option>
            <option value="yes">
              {t(
                'email-filter-yes',
                {
                  defaultValue:
                    'Yes',
                },
              )}
            </option>
            <option value="no">
              {t(
                'email-filter-no',
                {
                  defaultValue:
                    'No',
                },
              )}
            </option>
          </Select>
        </Field>
        <Field
          label={t(
            'email-filter-min-followers',
            {
              defaultValue:
                'At least this many followers',
            },
          )}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={
              0
            }
            value={
              value.minFollowers
            }
            onChange={(
              e,
            ) =>
              set(
                'minFollowers',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
        <Field
          label={t(
            'email-filter-min-posts',
            {
              defaultValue:
                'At least this many posts',
            },
          )}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={
              0
            }
            value={
              value.minPosts
            }
            onChange={(
              e,
            ) =>
              set(
                'minPosts',
                e
                  .target
                  .value,
              )
            }
          />
        </Field>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span
          id="email-filter-banned"
          className="t-body text-site-text"
        >
          {t(
            'email-filter-include-banned',
            {
              defaultValue:
                'Include banned accounts',
            },
          )}
        </span>
        <Switch
          checked={
            value.includeBanned
          }
          aria-labelledby="email-filter-banned"
          onCheckedChange={(
            v,
          ) =>
            set(
              'includeBanned',
              v,
            )
          }
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onChange(
              EMPTY_FILTERS,
            )
          }
        >
          {t(
            'email-filter-clear',
            {
              defaultValue:
                'Clear filters',
            },
          )}
        </Button>
      </div>
    </div>
  );
}

function ManualPicker({
  selected,
  onChange,
}: {
  selected: EmailRecipientSummary[];
  onChange: (
    next: EmailRecipientSummary[],
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin',
    );
  const [
    query,
    setQuery,
  ] =
    useState(
      '',
    );
  const [
    results,
    setResults,
  ] =
    useState<
      EmailRecipientSummary[]
    >(
      [],
    );

  useEffect(() => {
    const q =
      query.trim();
    if (
      !q
    ) {
      setResults(
        [],
      );
      return;
    }
    let live = true;
    const timer =
      setTimeout(
        () => {
          api(
            adminEmailUserSearch,
            {
              query:
                {
                  q,
                },
            },
          )
            .then(
              (
                r,
              ) => {
                if (
                  live
                )
                  setResults(
                    r.users,
                  );
              },
            )
            .catch(
              () => {},
            );
        },
        250,
      );
    return () => {
      live = false;
      clearTimeout(
        timer,
      );
    };
  }, [
    query,
  ]);

  const chosen =
    new Set(
      selected.map(
        (
          u,
        ) =>
          u.id,
      ),
    );

  return (
    <div className="space-y-4">
      <SearchField
        value={
          query
        }
        onValueChange={
          setQuery
        }
        placeholder={t(
          'email-manual-search',
          {
            defaultValue:
              'Search by name, handle or email',
          },
        )}
        aria-label={t(
          'email-manual-search',
          {
            defaultValue:
              'Search by name, handle or email',
          },
        )}
      />
      {results.length >
      0 ? (
        <ul className="divide-y divide-site-border border-y border-site-border">
          {results.map(
            (
              u,
            ) => (
              <li
                key={
                  u.id
                }
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate t-body text-site-text">
                    {recipientName(
                      u,
                    )}
                  </span>
                  <span className="block truncate t-meta">
                    {u.email ??
                      '—'}
                  </span>
                </span>
                <Button
                  size="xs"
                  disabled={
                    chosen.has(
                      u.id,
                    ) ||
                    !u.email
                  }
                  onClick={() =>
                    onChange(
                      [
                        ...selected,
                        u,
                      ],
                    )
                  }
                >
                  {chosen.has(
                    u.id,
                  )
                    ? t(
                        'email-manual-added',
                        {
                          defaultValue:
                            'Added',
                        },
                      )
                    : t(
                        'email-manual-add',
                        {
                          defaultValue:
                            'Add',
                        },
                      )}
                </Button>
              </li>
            ),
          )}
        </ul>
      ) : null}
      <div className="space-y-2">
        <p className="t-label">
          {t(
            'email-manual-selected',
            {
              count:
                selected.length,
              defaultValue:
                '{{count}} selected',
            },
          )}
        </p>
        {selected.length >
        0 ? (
          <ul className="divide-y divide-site-border border-t border-site-border">
            {selected.map(
              (
                u,
              ) => (
                <li
                  key={
                    u.id
                  }
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block truncate t-body text-site-text">
                      {recipientName(
                        u,
                      )}
                    </span>
                    <span className="block truncate t-meta">
                      {u.email ??
                        '—'}
                    </span>
                  </span>
                  <IconButton
                    icon={
                      X
                    }
                    size="icon-xs"
                    label={t(
                      'email-manual-remove',
                      {
                        defaultValue:
                          'Remove',
                      },
                    )}
                    onClick={() =>
                      onChange(
                        selected.filter(
                          (
                            s,
                          ) =>
                            s.id !==
                            u.id,
                        ),
                      )
                    }
                  />
                </li>
              ),
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
