import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Crown,
  LogOut,
  UserMinus,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import { Spinner } from '@/components/ui/spinner';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import {
  addGroupMembers,
  removeGroupMember,
  renameGroup,
  searchPeople,
  transferGroupOwner,
} from '@/lib/group-chat/manage.queries';
import {
  ADD_BATCH_MAX,
  GROUP_NAME_MAX,
} from '@/lib/group-chat/manage';
import type {
  Group,
  Sender,
} from '@/lib/group-chat/types';
import type { ResolvedUser } from '@/lib/user-display';

const label =
  (u: {
    name:
      | string
      | null;
    handle:
      | string
      | null;
  }) =>
    u.name ||
    (u.handle
      ? `@${u.handle}`
      : null);

/**
 * "Group info": the name, who is in the group and Leave for everyone; for the owner also rename, Add people, Remove
 * and Make owner. Its trigger is the group's name in the header. The body mounts only while the dialog is open.
 */
export function GroupInfoDialog({
  group,
  currentUserId,
  onChanged,
  onLeave,
}: {
  group: Group;
  currentUserId: string;
  /** Reload the group after a change this dialog made. */
  onChanged: () => void | Promise<void>;
  onLeave: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-chat-admin',
    );
  return (
    <Dialog>
      <DialogTrigger
        asChild
      >
        <button
          type="button"
          className="max-w-full truncate text-left"
          aria-label={t(
            'open-group-info',
            {
              name: group.name,
              defaultValue:
                'Group info: {{name}}',
            },
          )}
        >
          {
            group.name
          }
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              'group-info',
              {
                defaultValue:
                  'Group info',
              },
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'group-info-description',
              {
                count:
                  group
                    .members
                    .length,
                defaultValue_one:
                  '{{count}} member',
                defaultValue_other:
                  '{{count}} members',
              },
            )}
          </DialogDescription>
        </DialogHeader>
        <GroupInfoBody
          group={
            group
          }
          currentUserId={
            currentUserId
          }
          onChanged={
            onChanged
          }
          onLeave={
            onLeave
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function GroupInfoBody({
  group,
  currentUserId,
  onChanged,
  onLeave,
}: {
  group: Group;
  currentUserId: string;
  onChanged: () => void | Promise<void>;
  onLeave: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-chat-admin',
    );
  const confirm =
    useConfirm();
  const isOwner =
    group.isOwner;
  const [
    name,
    setName,
  ] =
    useState(
      group.name,
    );
  const [
    busy,
    setBusy,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );

  // A rename from the owner's other tab or a transfer arrives through the group reload: follow it unless editing.
  useEffect(() => {
    setName(
      group.name,
    );
  }, [
    group.name,
  ]);

  const failed =
    (
      e: unknown,
    ) =>
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'could-not-change',
            {
              defaultValue:
                'Could not change the group',
            },
          ),
      );

  async function save() {
    const next =
      name.trim();
    if (
      !next ||
      next ===
        group.name
    )
      return;
    setBusy(
      'rename',
    );
    try {
      await renameGroup(group.id, next);
      await onChanged();
    } catch (e) {
      failed(
        e,
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function remove(
    member: Sender,
  ) {
    const who =
      label(
        member,
      ) ??
      t(
        'member',
        {
          defaultValue:
            'Member',
        },
      );
    const ok =
      await confirm(
        {
          title:
            t(
              'remove-confirm',
              {
                name: who,
                defaultValue:
                  'Remove {{name}} from the group?',
              },
            ),
          confirmLabel:
            t(
              'remove',
              {
                defaultValue:
                  'Remove',
              },
            ),
          danger: true,
        },
      );
    if (
      !ok
    )
      return;
    setBusy(
      member.id,
    );
    try {
      await removeGroupMember(group.id, member.id);
      await onChanged();
    } catch (e) {
      failed(
        e,
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function makeOwner(
    member: Sender,
  ) {
    const who =
      label(
        member,
      ) ??
      t(
        'member',
        {
          defaultValue:
            'Member',
        },
      );
    const ok =
      await confirm(
        {
          title:
            t(
              'owner-confirm',
              {
                name: who,
                defaultValue:
                  'Make {{name}} the owner?',
              },
            ),
          description:
            t(
              'owner-confirm-description',
              {
                defaultValue:
                  'You become an ordinary member and can no longer change the group.',
              },
            ),
          confirmLabel:
            t(
              'make-owner',
              {
                defaultValue:
                  'Make owner',
              },
            ),
        },
      );
    if (
      !ok
    )
      return;
    setBusy(
      member.id,
    );
    try {
      await transferGroupOwner(group.id, member.id);
      await onChanged();
    } catch (e) {
      failed(
        e,
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {isOwner ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(
            e,
          ) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="group-name"
              className="t-label"
            >
              {t(
                'group-name',
                {
                  defaultValue:
                    'Group name',
                },
              )}
            </label>
            <Input
              id="group-name"
              value={
                name
              }
              maxLength={
                GROUP_NAME_MAX
              }
              onChange={(
                e,
              ) =>
                setName(
                  e
                    .target
                    .value,
                )
              }
            />
          </div>
          <Button
            type="submit"
            variant="default"
            disabled={
              !name.trim() ||
              name.trim() ===
                group.name ||
              busy ===
                'rename'
            }
          >
            {t(
              'save',
              {
                defaultValue:
                  'Save',
              },
            )}
          </Button>
        </form>
      ) : (
        <p className="t-heading">
          {
            group.name
          }
        </p>
      )}

      <section aria-labelledby="group-members-heading">
        <h3
          id="group-members-heading"
          className="t-label pb-1"
        >
          {t(
            'members',
            {
              defaultValue:
                'Members',
            },
          )}
        </h3>
        <ul>
          {group.members.map(
            (
              m,
            ) => {
              const who =
                label(
                  m,
                ) ??
                t(
                  'member',
                  {
                    defaultValue:
                      'Member',
                  },
                );
              const owner =
                m.id ===
                group.ownerId;
              return (
                <li
                  key={
                    m.id
                  }
                  className="flex items-center gap-3 border-b border-site-border py-2 last:border-b-0"
                >
                  <UserAvatar
                    src={
                      m.image
                    }
                    alt=""
                    size={
                      32
                    }
                    fallbackName={
                      m.name ??
                      undefined
                    }
                    className="rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="t-body truncate">
                      {
                        who
                      }
                      {m.id ===
                        currentUserId && (
                        <span className="t-meta">
                          {' '}
                          {t(
                            'you-marker',
                            {
                              defaultValue:
                                '(you)',
                            },
                          )}
                        </span>
                      )}
                    </p>
                    {owner && (
                      <p className="t-meta">
                        {t(
                          'owner',
                          {
                            defaultValue:
                              'Owner',
                          },
                        )}
                      </p>
                    )}
                  </div>
                  {isOwner &&
                    !owner && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={
                            busy ===
                            m.id
                          }
                          onClick={() =>
                            void makeOwner(
                              m,
                            )
                          }
                          title={t(
                            'make-owner-name',
                            {
                              name: who,
                              defaultValue:
                                'Make {{name}} owner',
                            },
                          )}
                          aria-label={t(
                            'make-owner-name',
                            {
                              name: who,
                              defaultValue:
                                'Make {{name}} owner',
                            },
                          )}
                        >
                          <Crown
                            aria-hidden
                          />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={
                            busy ===
                            m.id
                          }
                          onClick={() =>
                            void remove(
                              m,
                            )
                          }
                          title={t(
                            'remove-name',
                            {
                              name: who,
                              defaultValue:
                                'Remove {{name}}',
                            },
                          )}
                          aria-label={t(
                            'remove-name',
                            {
                              name: who,
                              defaultValue:
                                'Remove {{name}}',
                            },
                          )}
                        >
                          <UserMinus
                            aria-hidden
                          />
                        </Button>
                      </div>
                    )}
                </li>
              );
            },
          )}
        </ul>
      </section>

      {isOwner && (
        <AddPeople
          group={
            group
          }
          onChanged={
            onChanged
          }
        />
      )}

      <Button
        variant="danger"
        onClick={
          onLeave
        }
        className="self-start"
      >
        <LogOut
          aria-hidden
        />
        {t(
          'leave-group',
          {
            defaultValue:
              'Leave group',
          },
        )}
      </Button>
    </div>
  );
}

function AddPeople({
  group,
  onChanged,
}: {
  group: Group;
  onChanged: () => void | Promise<void>;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-chat-admin',
    );
  const [
    q,
    setQ,
  ] =
    useState(
      '',
    );
  const [
    results,
    setResults,
  ] =
    useState<
      ResolvedUser[]
    >(
      [],
    );
  const [
    searching,
    setSearching,
  ] =
    useState(
      false,
    );
  const [
    picked,
    setPicked,
  ] =
    useState<
      ResolvedUser[]
    >(
      [],
    );
  const [
    adding,
    setAdding,
  ] =
    useState(
      false,
    );
  // Announced politely after each Add: counts only, never why someone was left out.
  const [
    outcome,
    setOutcome,
  ] =
    useState<{
      added: number;
      refused: number;
    } | null>(
      null,
    );

  const search =
    useDebouncedCallback(
      async (
        term: string,
      ) => {
        try {
          const res =
            await searchPeople(term);
          setResults(
            res.users,
          );
        } catch {
          // typeahead: keep the previous results
        } finally {
          setSearching(
            false,
          );
        }
      },
      250,
    );
  useEffect(() => {
    const term =
      q.trim();
    if (
      !term
    ) {
      search.cancel();
      setResults(
        [],
      );
      setSearching(
        false,
      );
      return;
    }
    setSearching(
      true,
    );
    search(
      term,
    );
    return search.cancel;
  }, [
    q,
    search,
  ]);

  const taken =
    new Set(
      [
        ...group.members.map(
          (
            m,
          ) =>
            m.id,
        ),
        ...picked.map(
          (
            p,
          ) =>
            p.id,
        ),
      ],
    );
  const shown =
    results.filter(
      (
        u,
      ) =>
        !taken.has(
          u.id,
        ),
    );
  const full =
    picked.length >=
    ADD_BATCH_MAX;

  async function add() {
    if (
      picked.length ===
      0
    )
      return;
    setAdding(
      true,
    );
    try {
      const res =
        await addGroupMembers(group.id, picked.map((p) => p.id));
      setOutcome(
        {
          added:
            res.added,
          refused:
            res.refused,
        },
      );
      setPicked(
        [],
      );
      setQ(
        '',
      );
      await onChanged();
    } catch (e) {
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'could-not-change',
            {
              defaultValue:
                'Could not change the group',
            },
          ),
      );
    } finally {
      setAdding(
        false,
      );
    }
  }

  return (
    <section
      aria-labelledby="group-add-heading"
      className="flex flex-col gap-2"
    >
      <h3
        id="group-add-heading"
        className="t-label"
      >
        {t(
          'add-people',
          {
            defaultValue:
              'Add people',
          },
        )}
      </h3>
      {picked.length >
        0 && (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map(
            (
              p,
            ) => {
              const who =
                label(
                  p,
                ) ??
                t(
                  'member',
                  {
                    defaultValue:
                      'Member',
                  },
                );
              return (
                <li
                  key={
                    p.id
                  }
                >
                  <button
                    type="button"
                    className="t-body inline-flex h-9 items-center gap-1 rounded-site border border-site-border px-3 pointer-coarse:h-11"
                    onClick={() =>
                      setPicked(
                        (
                          cur,
                        ) =>
                          cur.filter(
                            (
                              c,
                            ) =>
                              c.id !==
                              p.id,
                          ),
                      )
                    }
                    aria-label={t(
                      'unpick-name',
                      {
                        name: who,
                        defaultValue:
                          'Do not add {{name}}',
                      },
                    )}
                  >
                    {
                      who
                    }
                    <X
                      className="size-3.5"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            },
          )}
        </ul>
      )}
      <SearchField
        value={
          q
        }
        onValueChange={
          setQ
        }
        aria-label={t(
          'search-people',
          {
            defaultValue:
              'Search people',
          },
        )}
        placeholder={t(
          'search-people-placeholder',
          {
            defaultValue:
              'Search people…',
          },
        )}
        trailing={
          searching ? (
            <Spinner
              size={
                16
              }
            />
          ) : undefined
        }
      />
      {full && (
        <p className="t-meta">
          {t(
            'batch-full',
            {
              count:
                ADD_BATCH_MAX,
              defaultValue:
                'You can add up to {{count}} people at a time.',
            },
          )}
        </p>
      )}
      {shown.length >
        0 &&
        !full && (
          <ul className="max-h-48 overflow-y-auto">
            {shown.map(
              (
                u,
              ) => (
                <li
                  key={
                    u.id
                  }
                  className="border-b border-site-border last:border-b-0"
                >
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left hover:bg-site-bg-subtle"
                    onClick={() =>
                      setPicked(
                        (
                          cur,
                        ) => [
                          ...cur,
                          u,
                        ],
                      )
                    }
                  >
                    <UserAvatar
                      src={
                        u.image
                      }
                      alt=""
                      size={
                        28
                      }
                      fallbackName={
                        u.name ??
                        undefined
                      }
                      className="rounded-full"
                    />
                    <span className="t-body min-w-0 flex-1 truncate">
                      {label(
                        u,
                      ) ??
                        t(
                          'member',
                          {
                            defaultValue:
                              'Member',
                          },
                        )}
                    </span>
                    {u.handle && (
                      <span className="t-meta truncate">
                        @
                        {
                          u.handle
                        }
                      </span>
                    )}
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      <Button
        variant="primary"
        className="self-start"
        disabled={
          picked.length ===
            0 ||
          adding
        }
        onClick={() =>
          void add()
        }
      >
        {t(
          'add',
          {
            defaultValue:
              'Add',
          },
        )}
      </Button>
      <p
        role="status"
        aria-live="polite"
        className="t-meta min-h-4"
      >
        {outcome &&
          [
            t(
              'added-count',
              {
                count:
                  outcome.added,
                defaultValue_one:
                  '{{count}} person added',
                defaultValue_other:
                  '{{count}} people added',
              },
            ),
            outcome.refused >
            0
              ? t(
                  'refused-count',
                  {
                    count:
                      outcome.refused,
                    defaultValue_one:
                      '{{count}} person could not be added',
                    defaultValue_other:
                      '{{count}} people could not be added',
                  },
                )
              : null,
          ]
            .filter(
              Boolean,
            )
            .join(
              '. ',
            )}
      </p>
    </section>
  );
}
