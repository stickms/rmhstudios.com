import { useEffect, useId, useState, type FormEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { HttpError, errorField } from '@/lib/http';
import { apiQuery } from '@/lib/contract/client';
import { searchUsersApi } from '@/lib/discovery/explore.contract';
import { flagHistoryApi, getFlagTargetingApi } from '@/lib/flags/targeting.contract';
import { checkFlag, editFlagTargeting, flagHistoryPage } from '@/lib/flags/targeting.queries';
import type { FlagCheckDTO, FlagHistoryItem, FlagTargetingDTO, TargetList, TargetMember } from '@/lib/flags/targeting';
import type { FlagReason } from '@/lib/flags/evaluate';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { currentDocumentLocale, formatDateTime } from '@/lib/core/format';

import { Handle } from '@/components/ui/handle';
const memberName = (m: TargetMember) => m.name ?? (m.handle ? `@${m.handle}` : m.id);

/**
 * The "Targeting" disclosure under a flag row on /admin/flags (s04-20): the allow and deny lists, a check for one
 * member, and the flag's history. Nothing is fetched until it is opened. The lists are read from the admin
 * endpoints only; they are never part of the flags a client evaluates.
 */
export function FlagTargeting({ flagKey }: { flagKey: string }) {
  const { t } = useTranslation('flag-targeting');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="basis-full">
      <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <Chevron className="h-4 w-4" aria-hidden />
        {t('toggle', {
          defaultValue: 'Targeting',
        })}
      </Button>
      {open ? (
        <div id={panelId} className="mt-2 divide-y divide-site-border border-t border-site-border">
          <p className="t-meta py-3">
            {t('apply-note', {
              defaultValue: 'A change applies on this server at once and on the others within 15 seconds.',
            })}
          </p>
          <TargetingLists flagKey={flagKey} />
          <CheckMember flagKey={flagKey} />
          <History flagKey={flagKey} />
        </div>
      ) : null}
    </div>
  );
}

function TargetingLists({ flagKey }: { flagKey: string }) {
  const { t } = useTranslation('flag-targeting');
  const queryClient = useQueryClient();
  const query = apiQuery(getFlagTargetingApi, {
    params: {
      key: flagKey,
    },
    retries: 0,
  });
  const { data, isError, refetch } = useQuery(query);
  const arrival = useArrival(data !== undefined);
  const [busy, setBusy] = useState(false);

  async function edit(
    list: TargetList,
    change: {
      add?: string[];
      remove?: string[];
    },
  ): Promise<boolean> {
    setBusy(true);
    try {
      const next = await editFlagTargeting(flagKey, { list, add: change.add ?? [], remove: change.remove ?? [] });
      queryClient.setQueryData<FlagTargetingDTO>(query.queryKey, next);
      void queryClient.invalidateQueries({
        queryKey: [
          flagHistoryApi.path,
          {
            key: flagKey,
          },
        ],
      });
      return true;
    } catch (error) {
      if (error instanceof HttpError && errorField<string>(error, 'code') === 'unknown-handle') {
        const handles = errorField<string[]>(error, 'handles') ?? [];
        toast.error(
          t('add-unknown', {
            defaultValue: 'No member has the handle {{handle}}.',
            handle: handles.map((h) => `@${h}`).join(', '),
          }),
        );
      } else if (error instanceof HttpError && errorField<string>(error, 'code') === 'full') {
        toast.error(
          t('add-full', {
            count: Number(data?.max ?? 200),
            defaultValue_one: 'A list holds at most {{max}} member.',
            defaultValue: 'A list holds at most {{max}} members.',
            max: data?.max ?? 200,
          }),
        );
      } else {
        toast.error(
          t('save-failed', {
            defaultValue: 'Could not save the list.',
          }),
        );
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 py-3">
        <p className="t-body text-site-danger">
          {t('lists-failed', {
            defaultValue: 'Could not load the lists.',
          })}
        </p>
        <Button variant="default" size="sm" onClick={() => void refetch()}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }
  return (
    <div className={cn('grid gap-x-6 sm:grid-cols-2', arrival)}>
      <MemberList
        list="allow"
        title={t('allow-title', {
          defaultValue: 'Always on for',
        })}
        empty={t('allow-empty', {
          defaultValue: 'Nobody is named. The rollout decides.',
        })}
        members={data.allow}
        busy={busy}
        onEdit={edit}
      />
      <MemberList
        list="deny"
        title={t('deny-title', {
          defaultValue: 'Always off for',
        })}
        empty={t('deny-empty', {
          defaultValue: 'Nobody is named.',
        })}
        members={data.deny}
        busy={busy}
        onEdit={edit}
      />
    </div>
  );
}

function MemberList({
  list,
  title,
  empty,
  members,
  busy,
  onEdit,
}: {
  list: TargetList;
  title: string;
  empty: string;
  members: TargetMember[];
  busy: boolean;
  onEdit: (
    list: TargetList,
    change: {
      add?: string[];
      remove?: string[];
    },
  ) => Promise<boolean>;
}) {
  const { t } = useTranslation('flag-targeting');
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 py-3">
      <h3 id={headingId} className="t-label">
        {title}
      </h3>
      {members.length === 0 ? (
        <p className="t-body mt-2 text-site-text-muted">{empty}</p>
      ) : (
        <ul aria-labelledby={headingId} className="mt-2 divide-y divide-site-border border-y border-site-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <UserAvatar src={m.image} alt="" size={28} fallbackName={memberName(m)} />
              <div className="min-w-0 flex-1">
                <p className="t-body truncate font-medium text-site-text">{memberName(m)}</p>
                {m.handle ? (
                  <p className="t-meta truncate">
                    <Handle handle={m.handle} />
                  </p>
                ) : null}
              </div>
              <IconButton
                icon={X}
                size="icon-xs"
                disabled={busy}
                onClick={() =>
                  void onEdit(list, {
                    remove: [m.id],
                  })
                }
                label={t('remove', {
                  defaultValue: 'Remove {{name}}',
                  name: m.handle ? `@${m.handle}` : memberName(m),
                })}
              />
            </li>
          ))}
        </ul>
      )}
      <AddMember
        list={list}
        members={members}
        busy={busy}
        onAdd={(handle) =>
          onEdit(list, {
            add: [handle],
          })
        }
      />
    </section>
  );
}

/** "Add by handle": type a handle and press Add, or pick from the people search under the field. */
function AddMember({
  list,
  members,
  busy,
  onAdd,
}: {
  list: TargetList;
  members: TargetMember[];
  busy: boolean;
  onAdd: (handle: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('flag-targeting');
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setTerm(text.trim().replace(/^@/, '')), 250);
    return () => clearTimeout(id);
  }, [text]);
  const search = useQuery({
    ...apiQuery(searchUsersApi, {
      query: {
        q: term,
      },
      retries: 0,
    }),
    enabled: term.length >= 2,
  });
  const present = new Set(members.map((m) => m.id));
  const suggestions = (term.length >= 2 ? (search.data?.users ?? []) : []).filter(
    (u) => u.handle && !present.has(u.id),
  );

  async function add(handle: string) {
    if (await onAdd(handle)) {
      setText('');
      setTerm('');
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const handle = text.trim().replace(/^@/, '').toLowerCase();
    if (handle) void add(handle);
  }
  const label = t('add-label', {
    defaultValue: 'Add by handle',
  });
  const listName =
    list === 'allow'
      ? t('list-allow', {
          defaultValue: 'always on',
        })
      : t('list-deny', {
          defaultValue: 'always off',
        });
  const fieldLabel = t('add-field', {
    defaultValue: 'Add by handle to the {{list}} list',
    list: listName,
  });
  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={21}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={label}
          aria-label={fieldLabel}
          disabled={busy}
        />
        <Button type="submit" variant="default" disabled={busy || text.trim() === ''}>
          {t('add', {
            defaultValue: 'Add',
          })}
        </Button>
      </div>
      {suggestions.length > 0 ? (
        <ul className="mt-1 divide-y divide-site-border border-y border-site-border">
          {suggestions.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => u.handle && void add(u.handle)}
                className="flex min-h-9 w-full items-center gap-3 py-1 text-start hover:bg-site-bg-subtle"
              >
                <UserAvatar src={u.image} alt="" size={24} fallbackName={u.name ?? u.handle ?? ''} />
                <span className="t-body min-w-0 flex-1 truncate">{u.name ?? u.handle}</span>
                <span className="t-meta">
                  <Handle handle={u.handle} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

/** The sentence for a resolved flag (FR-2). Literal keys: the extractor cannot follow a built one. */
function ReasonText({ result }: { result: FlagCheckDTO }) {
  const { t } = useTranslation('flag-targeting');
  return <>{reasonSentence(t, result.reason)}</>;
}

function reasonSentence(t: TFunction, reason: FlagReason): string {
  switch (reason.code) {
    case 'allowed':
      return t('reason-allowed', {
        defaultValue: 'On: in the allow list',
      });
    case 'denied':
      return t('reason-denied', {
        defaultValue: 'Off: in the deny list',
      });
    case 'disabled':
      return t('reason-disabled', {
        defaultValue: 'Off: flag disabled',
      });
    case 'missing':
      return t('reason-missing', {
        defaultValue: 'Off: no such flag',
      });
    case 'full':
      return t('reason-full', {
        defaultValue: 'On: rolled out to everyone',
      });
    case 'anonymous':
      return t('reason-anonymous', {
        defaultValue: 'Off: signed-out visitors only see a flag at 100%',
      });
    case 'bucket':
      return reason.bucket < reason.percent
        ? t('reason-bucket-on', {
            defaultValue: 'On: bucket {{bucket}} < {{percent}}%',
            bucket: reason.bucket,
            percent: reason.percent,
          })
        : t('reason-bucket-off', {
            defaultValue: 'Off: bucket {{bucket}} is not below {{percent}}%',
            bucket: reason.bucket,
            percent: reason.percent,
          });
  }
}

function CheckMember({ flagKey }: { flagKey: string }) {
  const { t } = useTranslation('flag-targeting');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FlagCheckDTO | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);

  async function check(e: FormEvent) {
    e.preventDefault();
    const typed = handle.trim().replace(/^@/, '').toLowerCase();
    if (!typed) return;
    setBusy(true);
    setResult(null);
    setNotFound(false);
    setFailed(false);
    try {
      setResult(await checkFlag(flagKey, typed));
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) setNotFound(true);
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="py-3">
      <h3 className="t-label">
        {t('check-title', {
          defaultValue: 'Check a member',
        })}
      </h3>
      <form onSubmit={check} className="mt-2 flex gap-2 sm:max-w-md">
        <Input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={21}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t('check-placeholder', {
            defaultValue: 'Handle',
          })}
          aria-label={t('check-field', {
            defaultValue: 'Handle of the member to check',
          })}
        />
        <Button type="submit" variant="default" disabled={busy || handle.trim() === ''}>
          {t('check', {
            defaultValue: 'Check',
          })}
        </Button>
      </form>
      <div role="status" aria-live="polite" className="mt-2 min-h-5">
        {result ? (
          <p className="t-body">
            <span className="font-medium text-site-text">{memberName(result.member)}</span>
            <span className="t-meta block">
              <ReasonText result={result} />
            </span>
          </p>
        ) : null}
        {notFound ? (
          <p className="t-body text-site-text-muted">
            {t('check-not-found', {
              defaultValue: 'No member has that handle.',
            })}
          </p>
        ) : null}
        {failed ? (
          <p className="t-body text-site-danger">
            {t('check-failed', {
              defaultValue: 'Could not check the flag.',
            })}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function actionLabel(t: TFunction, action: string): string {
  switch (action) {
    case 'flag.upsert':
      return t('action-upsert', {
        defaultValue: 'Changed the flag',
      });
    case 'flag.delete':
      return t('action-delete', {
        defaultValue: 'Deleted the flag',
      });
    case 'flag.targeting':
      return t('action-targeting', {
        defaultValue: 'Changed the lists',
      });
    default:
      return action;
  }
}

const stamp = (iso: string) =>
  formatDateTime(new Date(iso), currentDocumentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

function History({ flagKey }: { flagKey: string }) {
  const { t } = useTranslation('flag-targeting');
  const headingId = useId();
  const list = useInfiniteQuery({
    queryKey: [
      flagHistoryApi.path,
      {
        key: flagKey,
      },
      'pages',
    ],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => flagHistoryPage(flagKey, pageParam, signal),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items: FlagHistoryItem[] = list.data?.pages.flatMap((p) => p.items) ?? [];
  const arrival = useArrival(list.data !== undefined);
  return (
    <section aria-labelledby={headingId} className="py-3">
      <h3 id={headingId} className="t-label">
        {t('history-title', {
          defaultValue: 'History',
        })}
      </h3>
      {list.isError ? (
        <div className="mt-2 flex items-center gap-3">
          <p className="t-body text-site-danger">
            {t('history-failed', {
              defaultValue: 'Could not load the history.',
            })}
          </p>
          <Button variant="default" size="sm" onClick={() => void list.refetch()}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        </div>
      ) : list.data === undefined ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className={cn('t-body mt-2 text-site-text-muted', arrival)}>
          {t('history-empty', {
            defaultValue: 'No changes recorded yet.',
          })}
        </p>
      ) : (
        <ul className={cn('mt-2 divide-y divide-site-border border-y border-site-border', arrival)}>
          {items.map((item) => (
            <li key={item.id} className="py-2">
              <p className="t-body">
                <span className="font-medium text-site-text">{actionLabel(t, item.action)}</span>
                {item.detail ? <span className="text-site-text-muted"> {item.detail}</span> : null}
              </p>
              <p className="t-meta">
                {memberName(item.admin)} · {stamp(item.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button
          variant="default"
          size="sm"
          className="mt-3"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('history-more', {
            defaultValue: 'Show older',
          })}
        </Button>
      ) : null}
    </section>
  );
}
