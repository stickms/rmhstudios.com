import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { serverError } from '@/lib/http';
import { toast } from '@/lib/toast';
import {
  createGroupInvite,
  listGroupInvites,
  revokeGroupInvite,
} from '@/lib/group-chat/invites.queries';
import {
  INVITE_EXPIRY_DAYS,
  INVITE_MAX_USES,
  MAX_LIVE_INVITES,
  invitePath,
  maskCode,
  type InviteExpiryDays,
  type InviteMaxUses,
  type InviteRow,
} from '@/lib/group-chat/invites';

/** The owner's "Invite links": live links with Copy and Revoke, and a form to make one. Mounts its body only while open. */
export function InviteLinksDialog({
  groupId,
}: {
  groupId: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'group-invites',
    );
  return (
    <Dialog>
      <DialogTrigger
        asChild
      >
        <Button
          variant="default"
          className="self-start"
        >
          <Link2
            aria-hidden
          />
          {t(
            'open-invite-links',
            {
              defaultValue:
                'Invite links',
            },
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(
              'invite-links-title',
              {
                defaultValue:
                  'Invite links',
              },
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'invite-links-description',
              {
                defaultValue:
                  'Anyone signed in who opens a link can join, until it expires, runs out or you revoke it.',
              },
            )}
          </DialogDescription>
        </DialogHeader>
        <InviteLinksBody
          groupId={
            groupId
          }
        />
      </DialogContent>
    </Dialog>
  );
}

function InviteLinksBody({
  groupId,
}: {
  groupId: string;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'group-invites',
    );
  const confirm =
    useConfirm();
  const [
    rows,
    setRows,
  ] =
    useState<
      | InviteRow[]
      | null
    >(
      null,
    );
  const [
    failed,
    setFailed,
  ] =
    useState(
      false,
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
  const [
    expiry,
    setExpiry,
  ] =
    useState<string>(
      '7',
    );
  const [
    uses,
    setUses,
  ] =
    useState<string>(
      '10',
    );
  const arrival =
    useArrival(
      rows !==
        null,
    );

  const load =
    useCallback(async () => {
      try {
        const res =
          await listGroupInvites(
            groupId,
          );
        setRows(
          res.invites,
        );
        setFailed(
          false,
        );
      } catch {
        setFailed(
          true,
        );
      }
    }, [
      groupId,
    ]);
  useEffect(() => {
    void load();
  }, [
    load,
  ]);

  const date =
    new Intl.DateTimeFormat(
      i18n.language,
      {
        dateStyle:
          'medium',
      },
    );

  async function create() {
    setBusy(
      'create',
    );
    try {
      await createGroupInvite(
        groupId,
        {
          expiresInDays:
            (expiry ===
            'never'
              ? null
              : Number(
                  expiry,
                )) as InviteExpiryDays,
          maxUses:
            (uses ===
            'unlimited'
              ? null
              : Number(
                  uses,
                )) as InviteMaxUses,
        },
      );
      await load();
    } catch (e) {
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'could-not-create',
            {
              defaultValue:
                'Could not create the link',
            },
          ),
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  async function revoke(
    row: InviteRow,
  ) {
    const ok =
      await confirm(
        {
          title:
            t(
              'revoke-confirm',
              {
                defaultValue:
                  'Revoke this link?',
              },
            ),
          description:
            t(
              'revoke-confirm-description',
              {
                defaultValue:
                  'Nobody new can join with it. People who already joined stay in the group.',
              },
            ),
          confirmLabel:
            t(
              'revoke',
              {
                defaultValue:
                  'Revoke',
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
      row.id,
    );
    try {
      await revokeGroupInvite(
        groupId,
        row.id,
      );
      await load();
    } catch (e) {
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'could-not-revoke',
            {
              defaultValue:
                'Could not revoke the link',
            },
          ),
      );
    } finally {
      setBusy(
        null,
      );
    }
  }

  const full =
    (rows?.length ??
      0) >=
    MAX_LIVE_INVITES;
  const origin =
    typeof window ===
    'undefined'
      ? ''
      : window
          .location
          .origin;

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-labelledby="invite-new-heading"
        className="flex flex-col gap-2"
      >
        <h3
          id="invite-new-heading"
          className="t-label"
        >
          {t(
            'create-heading',
            {
              defaultValue:
                'Create link',
            },
          )}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="invite-expiry"
              className="t-label"
            >
              {t(
                'expires-label',
                {
                  defaultValue:
                    'Expires',
                },
              )}
            </label>
            <Select
              id="invite-expiry"
              value={
                expiry
              }
              onChange={(
                e,
              ) =>
                setExpiry(
                  e
                    .target
                    .value,
                )
              }
            >
              {INVITE_EXPIRY_DAYS.map(
                (
                  d,
                ) =>
                  d ===
                  null ? (
                    <option
                      key="never"
                      value="never"
                    >
                      {t(
                        'expiry-never',
                        {
                          defaultValue:
                            'Never',
                        },
                      )}
                    </option>
                  ) : (
                    <option
                      key={
                        d
                      }
                      value={String(
                        d,
                      )}
                    >
                      {t(
                        'expiry-days',
                        {
                          count:
                            d,
                          defaultValue_one:
                            '{{count}} day',
                          defaultValue_other:
                            '{{count}} days',
                        },
                      )}
                    </option>
                  ),
              )}
            </Select>
          </div>
          <div>
            <label
              htmlFor="invite-uses"
              className="t-label"
            >
              {t(
                'uses-label',
                {
                  defaultValue:
                    'Maximum uses',
                },
              )}
            </label>
            <Select
              id="invite-uses"
              value={
                uses
              }
              onChange={(
                e,
              ) =>
                setUses(
                  e
                    .target
                    .value,
                )
              }
            >
              {INVITE_MAX_USES.map(
                (
                  n,
                ) =>
                  n ===
                  null ? (
                    <option
                      key="unlimited"
                      value="unlimited"
                    >
                      {t(
                        'uses-unlimited',
                        {
                          defaultValue:
                            'Unlimited',
                        },
                      )}
                    </option>
                  ) : (
                    <option
                      key={
                        n
                      }
                      value={String(
                        n,
                      )}
                    >
                      {
                        n
                      }
                    </option>
                  ),
              )}
            </Select>
          </div>
        </div>
        <Button
          variant="primary"
          className="self-start"
          onClick={() =>
            void create()
          }
          loading={
            busy ===
            'create'
          }
          disabled={
            full ||
            busy !==
              null
          }
        >
          {t(
            'create-link',
            {
              defaultValue:
                'Create link',
            },
          )}
        </Button>
        {full && (
          <p className="t-meta">
            {t(
              'limit-reached',
              {
                count:
                  MAX_LIVE_INVITES,
                defaultValue:
                  'A group can have {{count}} links at a time. Revoke one to make another.',
              },
            )}
          </p>
        )}
      </section>

      <section aria-labelledby="invite-live-heading">
        <h3
          id="invite-live-heading"
          className="t-label pb-1"
        >
          {t(
            'live-heading',
            {
              defaultValue:
                'Live links',
            },
          )}
        </h3>
        {failed ? (
          <p
            className="t-body text-site-danger"
            role="alert"
          >
            {t(
              'load-error',
              {
                defaultValue:
                  'Could not load the links.',
              },
            )}
          </p>
        ) : rows ===
          null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : rows.length ===
          0 ? (
          <p className="t-meta py-2">
            {t(
              'empty',
              {
                defaultValue:
                  'No live links.',
              },
            )}
          </p>
        ) : (
          <ul
            className={
              arrival
            }
          >
            {rows.map(
              (
                row,
              ) => {
                const masked =
                  maskCode(
                    row.code,
                  );
                return (
                  <li
                    key={
                      row.id
                    }
                    className="flex items-center gap-3 border-b border-site-border py-2 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="t-body font-mono"
                        aria-label={t(
                          'code-name',
                          {
                            tail: row.code.slice(
                              -4,
                            ),
                            defaultValue:
                              'Invite link ending {{tail}}',
                          },
                        )}
                      >
                        {
                          masked
                        }
                      </p>
                      <p className="t-meta">
                        {row.maxUses ===
                        null
                          ? t(
                              'uses-count-unlimited',
                              {
                                count:
                                  row.uses,
                                defaultValue:
                                  '{{count}} joined',
                              },
                            )
                          : t(
                              'uses-count',
                              {
                                count:
                                  row.uses,
                                max: row.maxUses,
                                defaultValue:
                                  '{{count}} of {{max}} joined',
                              },
                            )}
                        {
                          ' · '
                        }
                        {row.expiresAt
                          ? t(
                              'expires-on',
                              {
                                date: date.format(
                                  new Date(
                                    row.expiresAt,
                                  ),
                                ),
                                defaultValue:
                                  'Expires {{date}}',
                              },
                            )
                          : t(
                              'never-expires',
                              {
                                defaultValue:
                                  'Never expires',
                              },
                            )}
                      </p>
                      {row.createdByName && (
                        <p className="t-meta">
                          {t(
                            'created-by',
                            {
                              ns: 'group-admins',
                              name: row.createdByName,
                              defaultValue:
                                'Made by {{name}}',
                            },
                          )}
                        </p>
                      )}
                    </div>
                    <CopyButton
                      value={`${origin}${invitePath(row.code)}`}
                      variant="default"
                      label={t(
                        'copy',
                        {
                          defaultValue:
                            'Copy',
                        },
                      )}
                    >
                      {t(
                        'copy',
                        {
                          defaultValue:
                            'Copy',
                        },
                      )}
                    </CopyButton>
                    <Button
                      variant="ghost"
                      disabled={
                        busy ===
                        row.id
                      }
                      onClick={() =>
                        void revoke(
                          row,
                        )
                      }
                      aria-label={t(
                        'revoke-name',
                        {
                          tail: row.code.slice(
                            -4,
                          ),
                          defaultValue:
                            'Revoke link ending {{tail}}',
                        },
                      )}
                    >
                      {t(
                        'revoke',
                        {
                          defaultValue:
                            'Revoke',
                        },
                      )}
                    </Button>
                  </li>
                );
              },
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
