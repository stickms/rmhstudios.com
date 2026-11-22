/** N4 — the community mod queue: held and flagged content, plus the removal log. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Inbox } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { MacroField } from '@/components/safety/MacroField';
import { Select } from '@/components/ui/select';
import type { ModItemDTO } from '@/lib/communities/plus';
import type { CommunityRuleDTO } from '@/lib/communities/rules';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { MemberNotesPreview } from '@/components/communities/MemberNotesPreview';

export function ModQueue({
  slug,
  rules = [],
  onOpenLog,
}: {
  slug: string;
  /** s03-14: opens the Log tab, the full record of moderation actions. */
  onOpenLog?: () => void;
  /** The community's rules, for citing one on a removal. */ rules?: CommunityRuleDTO[];
}) {
  const fmt = useLocaleFormat();
  const { t } = useTranslation('f-communities-plus');
  const { t: tr } = useTranslation('community-rules');
  const { t: tl } = useTranslation('community-modlog');
  // s03-13: the rule a moderator cites for each item they remove.
  const [cited, setCited] = useState<Record<string, string>>({});
  const [view, setView] = useState<'pending' | 'log'>('pending');
  const [items, setItems] = useState<ModItemDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const arrival = useArrival(items !== null);
  // S4: per-item message to the author, filled from a macro.
  const [messages, setMessages] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setItems(null);
    const res = await plusFetch<{
      items: ModItemDTO[];
    }>(communityApi(slug, `/modqueue?view=${view}`));
    setItems(res.data?.items ?? []);
  }, [slug, view]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (item: ModItemDTO, decision: 'approve' | 'remove') => {
    setBusy(item.id);
    const res = await plusFetch(communityApi(slug, `/modqueue/${item.id}`), 'POST', {
      decision,
      message: decision === 'remove' ? messages[item.id]?.trim() || undefined : undefined,
      ruleId: decision === 'remove' ? cited[item.id] || undefined : undefined,
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(
        res.error ||
          t('queue-error', {
            defaultValue: "Couldn't update the item",
          }),
      );
      return;
    }
    setItems((cur) => cur?.filter((i) => i.id !== item.id) ?? null);
  };

  const actionLabel = (a: ModItemDTO['action']) =>
    a === 'hold'
      ? t('queue-action-hold', {
          defaultValue: 'Held',
        })
      : a === 'flag'
        ? t('queue-action-flag', {
            defaultValue: 'Flagged',
          })
        : a === 'report'
          ? tr('queue-action-report', {
              defaultValue: 'Reported',
            })
          : t('queue-action-remove', {
              defaultValue: 'Removed',
            });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Button size="sm" variant={view === 'pending' ? 'default' : 'default'} onClick={() => setView('pending')}>
          {t('queue-pending', {
            defaultValue: 'Needs review',
          })}
        </Button>
        <Button size="sm" variant={view === 'log' ? 'default' : 'default'} onClick={() => setView('log')}>
          {t('queue-log', {
            defaultValue: 'Resolved and removed',
          })}
        </Button>
        {onOpenLog && (
          <Button size="sm" variant="ghost" onClick={onOpenLog}>
            {tl('queue-full-log', {
              defaultValue: 'Full moderation log',
            })}
          </Button>
        )}
      </div>
      {!items ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          className={arrival}
          icon={Inbox}
          title={t('queue-empty', {
            defaultValue: 'Nothing here',
          })}
        />
      ) : (
        <ul className={cn('flex flex-col gap-2', arrival)}>
          {items.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-site-text-muted">
                <span className="font-semibold text-site-text">
                  {i.author.name ||
                    i.author.handle ||
                    t('someone', {
                      defaultValue: 'Someone',
                    })}
                </span>
                <span>
                  {i.entityType === 'comment'
                    ? t('queue-kind-comment', {
                        defaultValue: 'comment',
                      })
                    : t('queue-kind-post', {
                        defaultValue: 'post',
                      })}
                </span>
                <span>·</span>
                <span>
                  {i.action === 'report' ? (
                    tr('queue-reported-rule', {
                      rule: i.ruleName,
                      defaultValue: 'Reported: {{rule}}',
                    })
                  ) : (
                    <>
                      {actionLabel(i.action)} {' · '}{' '}
                      {t('queue-rule', {
                        rule: i.ruleName,
                        defaultValue: 'rule: {{rule}}',
                      })}
                    </>
                  )}
                </span>
                {i.action === 'report' && (i.reporters ?? 0) > 1 && (
                  <>
                    <span> · </span>
                    <span>
                      {tr('queue-reporters', {
                        count: i.reporters,
                        defaultValue: '{{count}} members reported this',
                      })}
                    </span>
                  </>
                )}
                <span> · </span> <span> {fmt.relative(new Date(i.createdAt))}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-site-text">{i.snapshot}</p>
              <MemberNotesPreview
                slug={slug}
                member={{
                  id: i.author.id,
                  name: i.author.name ?? null,
                  handle: i.author.handle ?? null,
                }}
              />
              {i.status === 'PENDING' && (
                <MacroField
                  scope={{
                    kind: 'community',
                    slug,
                  }}
                  vars={{
                    user: i.author.name || i.author.handle || undefined,
                    reason: i.ruleName,
                  }}
                  value={messages[i.id] ?? ''}
                  onChange={(v) =>
                    setMessages((m) => ({
                      ...m,
                      [i.id]: v,
                    }))
                  }
                />
              )}
              {i.status === 'PENDING' && rules.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor={`cite-${i.id}`} className="t-meta shrink-0">
                    {tr('cite-label', {
                      defaultValue: 'Cite a rule',
                    })}
                  </label>
                  <Select
                    id={`cite-${i.id}`}
                    value={cited[i.id] ?? ''}
                    onChange={(e) =>
                      setCited((c) => ({
                        ...c,
                        [i.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {tr('cite-none', {
                        defaultValue: 'No rule',
                      })}
                    </option>
                    {rules.map((r) => (
                      <option key={r.id} value={r.id}>
                        {tr('cite-option', {
                          n: r.position,
                          title: r.title,
                          defaultValue: '{{n}}. {{title}}',
                        })}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {i.status === 'PENDING' ? (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="default" disabled={busy === i.id} onClick={() => decide(i, 'remove')}>
                    {i.action === 'flag'
                      ? t('queue-remove-live', {
                          defaultValue: 'Remove it',
                        })
                      : t('queue-keep-removed', {
                          defaultValue: 'Keep removed',
                        })}
                  </Button>
                  <Button size="sm" variant="default" disabled={busy === i.id} onClick={() => decide(i, 'approve')}>
                    {i.action === 'flag'
                      ? t('queue-dismiss', {
                          defaultValue: 'Looks fine',
                        })
                      : t('queue-approve', {
                          defaultValue: 'Approve',
                        })}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-site-text-muted">
                  {i.status === 'APPROVED'
                    ? t('queue-status-approved', {
                        defaultValue: 'Approved',
                      })
                    : i.citedRule
                      ? tr('queue-status-removed-cited', {
                          n: i.citedRule.position,
                          title: i.citedRule.title,
                          defaultValue: 'Removed for breaking rule {{n}}: {{title}}',
                        })
                      : t('queue-status-removed', {
                          defaultValue: 'Removed',
                        })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
