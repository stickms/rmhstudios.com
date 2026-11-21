/** s06-01 — "Time out…" / "Ban…": the dialog a moderator fills in, and the member-row menu that opens it. */
import {
  useRef,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ellipsis } from 'lucide-react';
import { toast } from '@/lib/toast';
import {
  api,
  apiQuery,
} from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { MemberNotesPreview } from '@/components/communities/MemberNotesPreview';
import { addNoteApi } from '@/lib/communities/member-notes.contract';
import { createSanctionApi } from '@/lib/communities/bans.contract';
import { getRulesApi } from '@/lib/communities/rules.contract';
import type { CommunityRuleDTO } from '@/lib/communities/rules';
import {
  SANCTION_REASON_MAX,
  type SanctionDuration,
  type SanctionKind,
} from '@/lib/communities/bans';

export interface SanctionMember {
  id: string;
  name:
    | string
    | null;
  handle:
    | string
    | null;
}

export function SanctionDialog({
  slug,
  kind,
  member,
  onClose,
  onDone,
}: {
  slug: string;
  kind: SanctionKind;
  member: SanctionMember;
  onClose: () => void;
  onDone: (
    kind: SanctionKind,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      ['community-bans', 'community-notes'],
    );
  const [
    duration,
    setDuration,
  ] =
    useState<SanctionDuration>(
      kind ===
        'ban'
        ? '7d'
        : '1d',
    );
  const [
    ruleId,
    setRuleId,
  ] =
    useState(
      '',
    );
  const [
    reason,
    setReason,
  ] =
    useState(
      '',
    );
  // No rules to cite on a failed read; the field simply offers none.
  const rulesQuery = useQuery({
    ...apiQuery(getRulesApi, { params: { slug } }),
    retry: false,
  });
  const rules: CommunityRuleDTO[] = rulesQuery.data?.rules ?? [];
  const [
    busy,
    setBusy,
  ] =
    useState(
      false,
    );
  // s06-02: also keep the private reason as a moderator note, linked to this sanction.
  const [
    alsoNote,
    setAlsoNote,
  ] =
    useState(
      false,
    );
  const name =
    member.name ??
    (member.handle
      ? `@${member.handle}`
      : t(
          'someone',
          {
            defaultValue:
              'this member',
          },
        ));

  const submit =
    async () => {
      setBusy(
        true,
      );
      try {
        const created = await api(
          createSanctionApi,
          {
            params:
              {
                slug,
              },
            body: {
              userId:
                member.id,
              kind,
              duration,
              ...(ruleId
                ? {
                    ruleId,
                  }
                : {}),
              ...(reason.trim()
                ? {
                    reason:
                      reason.trim(),
                  }
                : {}),
            },
          },
        );
        if (alsoNote && reason.trim()) {
          try {
            await api(addNoteApi, {
              params: { slug, userId: member.id },
              body: { body: reason.trim(), banId: created.id },
            });
          } catch {
            // The sanction stands; only the note failed.
            toast.error(
              t('note-not-saved', {
                ns: 'community-notes',
                defaultValue: 'The sanction was applied, but the note could not be saved',
              }),
            );
          }
        }
        toast.success(
          kind ===
            'ban'
            ? t(
                'banned-toast',
                {
                  name,
                  defaultValue:
                    '{{name}} was banned',
                },
              )
            : t(
                'timed-out-toast',
                {
                  name,
                  defaultValue:
                    '{{name}} was timed out',
                },
              ),
        );
        onDone(
          kind,
        );
        onClose();
      } catch (err) {
        toast.error(
          serverError(
            err,
          ) ||
            t(
              'action-failed',
              {
                defaultValue:
                  'Could not save that',
              },
            ),
        );
      } finally {
        setBusy(
          false,
        );
      }
    };

  return (
    <Dialog
      open
      onOpenChange={(
        o,
      ) =>
        !o &&
        onClose()
      }
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind ===
            'ban'
              ? t(
                  'ban-title',
                  {
                    name,
                    defaultValue:
                      'Ban {{name}}',
                  },
                )
              : t(
                  'timeout-title',
                  {
                    name,
                    defaultValue:
                      'Time out {{name}}',
                  },
                )}
          </DialogTitle>
          <DialogDescription>
            {kind ===
            'ban'
              ? t(
                  'ban-hint',
                  {
                    defaultValue:
                      'They are removed from the community and cannot rejoin, post or comment.',
                  },
                )
              : t(
                  'timeout-hint',
                  {
                    defaultValue:
                      'They stay a member and can read, but cannot post or comment.',
                  },
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sanction-duration">
              {t(
                'duration-label',
                {
                  defaultValue:
                    'Length',
                },
              )}
            </Label>
            <Select
              id="sanction-duration"
              value={
                duration
              }
              onChange={(
                e,
              ) =>
                setDuration(
                  e
                    .target
                    .value as SanctionDuration,
                )
              }
            >
              {kind ===
              'ban' ? (
                <>
                  <option value="1d">
                    {t(
                      'duration-1d',
                      {
                        defaultValue:
                          '1 day',
                      },
                    )}
                  </option>
                  <option value="7d">
                    {t(
                      'duration-7d',
                      {
                        defaultValue:
                          '7 days',
                      },
                    )}
                  </option>
                  <option value="30d">
                    {t(
                      'duration-30d',
                      {
                        defaultValue:
                          '30 days',
                      },
                    )}
                  </option>
                  <option value="forever">
                    {t(
                      'duration-forever',
                      {
                        defaultValue:
                          'Until a moderator lifts it',
                      },
                    )}
                  </option>
                </>
              ) : (
                <>
                  <option value="1h">
                    {t(
                      'duration-1h',
                      {
                        defaultValue:
                          '1 hour',
                      },
                    )}
                  </option>
                  <option value="1d">
                    {t(
                      'duration-1d',
                      {
                        defaultValue:
                          '1 day',
                      },
                    )}
                  </option>
                  <option value="3d">
                    {t(
                      'duration-3d',
                      {
                        defaultValue:
                          '3 days',
                      },
                    )}
                  </option>
                  <option value="7d">
                    {t(
                      'duration-7d',
                      {
                        defaultValue:
                          '7 days',
                      },
                    )}
                  </option>
                </>
              )}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sanction-rule">
              {t(
                'rule-label',
                {
                  defaultValue:
                    'Rule broken (optional)',
                },
              )}
            </Label>
            <Select
              id="sanction-rule"
              value={
                ruleId
              }
              onChange={(
                e,
              ) =>
                setRuleId(
                  e
                    .target
                    .value,
                )
              }
            >
              <option value="">
                {t(
                  'rule-none',
                  {
                    defaultValue:
                      'No rule',
                  },
                )}
              </option>
              {rules.map(
                (
                  r,
                ) => (
                  <option
                    key={
                      r.id
                    }
                    value={
                      r.id
                    }
                  >
                    {`${r.position}. ${r.title}`}
                  </option>
                ),
              )}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sanction-reason">
              {t(
                'reason-label',
                {
                  defaultValue:
                    'Private note (moderators only)',
                },
              )}
            </Label>
            <Textarea
              id="sanction-reason"
              value={
                reason
              }
              maxLength={
                SANCTION_REASON_MAX
              }
              rows={
                3
              }
              onChange={(
                e,
              ) =>
                setReason(
                  e
                    .target
                    .value,
                )
              }
            />
            <p className="t-meta">
              {t(
                'reason-count',
                {
                  used: reason.length,
                  max: SANCTION_REASON_MAX,
                  defaultValue:
                    '{{used}} of {{max}}',
                },
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="sanction-also-note"
              checked={alsoNote}
              onCheckedChange={setAlsoNote}
              disabled={!reason.trim()}
            />
            <Label htmlFor="sanction-also-note">
              {t('also-note', {
                ns: 'community-notes',
                defaultValue: 'Also save the reason as a note',
              })}
            </Label>
          </div>
          <MemberNotesPreview slug={slug} member={member} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={
              onClose
            }
            disabled={
              busy
            }
          >
            {t(
              'cancel',
              {
                defaultValue:
                  'Cancel',
              },
            )}
          </Button>
          <Button
            variant="default"
            onClick={() =>
              void submit()
            }
            disabled={
              busy
            }
          >
            {kind ===
            'ban'
              ? t(
                  'ban-button',
                  {
                    defaultValue:
                      'Ban',
                  },
                )
              : t(
                  'timeout-button',
                  {
                    defaultValue:
                      'Time out',
                  },
                )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The row menu a moderator sees on a member: "Time out…" and "Ban…". */
export function MemberSanctionMenu({
  slug,
  member,
  onDone,
}: {
  slug: string;
  member: SanctionMember;
  onDone: (
    member: SanctionMember,
    kind: SanctionKind,
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'community-bans',
    );
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );
  const [
    kind,
    setKind,
  ] =
    useState<SanctionKind | null>(
      null,
    );
  const triggerRef =
    useRef<HTMLButtonElement>(
      null,
    );
  const name =
    member.name ??
    (member.handle
      ? `@${member.handle}`
      : t(
          'someone',
          {
            defaultValue:
              'this member',
          },
        ));
  return (
    <>
      <button
        ref={
          triggerRef
        }
        type="button"
        aria-haspopup="menu"
        aria-expanded={
          open
        }
        aria-label={t(
          'menu-label',
          {
            name,
            defaultValue:
              'Moderation actions for {{name}}',
          },
        )}
        onClick={() =>
          setOpen(
            (
              o,
            ) =>
              !o,
          )
        }
        className="rounded-site-sm p-1.5 text-site-text-muted hover:bg-site-bg-subtle hover:text-site-text"
      >
        <Ellipsis
          className="h-4 w-4"
          aria-hidden
        />
      </button>
      <AnchoredMenu
        open={
          open
        }
        onClose={() =>
          setOpen(
            false,
          )
        }
        anchorRef={
          triggerRef
        }
        label={t(
          'menu-title',
          {
            defaultValue:
              'Moderation',
          },
        )}
        className="w-44"
      >
        <MenuItem
          onSelect={() => {
            setOpen(
              false,
            );
            setKind(
              'timeout',
            );
          }}
        >
          {t(
            'menu-timeout',
            {
              defaultValue:
                'Time out…',
            },
          )}
        </MenuItem>
        <MenuItem
          tone="danger"
          onSelect={() => {
            setOpen(
              false,
            );
            setKind(
              'ban',
            );
          }}
        >
          {t(
            'menu-ban',
            {
              defaultValue:
                'Ban…',
            },
          )}
        </MenuItem>
      </AnchoredMenu>
      {kind && (
        <SanctionDialog
          slug={
            slug
          }
          kind={
            kind
          }
          member={
            member
          }
          onClose={() =>
            setKind(
              null,
            )
          }
          onDone={(
            k,
          ) =>
            onDone(
              member,
              k,
            )
          }
        />
      )}
    </>
  );
}
