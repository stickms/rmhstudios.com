/** s03-13 — mods write the community's rules: add, edit, delete, reorder, and the agreement switch. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SortableList } from '@/components/ui/sortable-list';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useArrival } from '@/components/ui/arrive';
import { getRulesApi, saveRulesApi } from '@/lib/communities/rules.contract';
import { RULES_MAX, RULE_DESCRIPTION_MAX, RULE_TITLE_MAX } from '@/lib/communities/rules';

/** A rule being edited. `key` is stable for the row; `serverId` is set for a saved rule. */
interface Draft {
  id: string;
  serverId?: string;
  title: string;
  description: string;
}

let draftCounter = 0;
const newKey = () => `new-${(draftCounter += 1)}`;

export function ModRules({ slug, onChange }: { slug: string; onChange: () => void }) {
  const { t } = useTranslation('community-rules');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [requireAgreement, setRequireAgreement] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const arrival = useArrival(drafts !== null);

  // Fetched once per open of the tab; the editor owns the drafts afterwards, so the
  // query never refetches on its own (a background refetch would discard edits).
  const rules = useQuery({
    queryKey: ['community-rules-editor', slug],
    queryFn: () =>
      api(getRulesApi, {
        params: {
          slug,
        },
      }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const failed = rules.isError;
  const load = () => rules.refetch();
  // Seed the editable drafts from each fresh fetch (React's "adjust state when
  // a value changes" pattern: during render, not in an effect).
  const [seededAt, setSeededAt] = useState(0);
  if (rules.data && rules.dataUpdatedAt !== seededAt) {
    setSeededAt(rules.dataUpdatedAt);
    setDrafts(
      rules.data.rules.map((r) => ({
        id: r.id,
        serverId: r.id,
        title: r.title,
        description: r.description ?? '',
      })),
    );
    setRequireAgreement(rules.data.requireAgreement);
    setDirty(false);
  }

  const edit = (next: Draft[]) => {
    setDrafts(next);
    setDirty(true);
  };

  const save = async () => {
    if (!drafts) return;
    setSaving(true);
    try {
      const data = await api(saveRulesApi, {
        params: {
          slug,
        },
        body: {
          requireAgreement,
          rules: drafts.map((d) => ({
            ...(d.serverId
              ? {
                  id: d.serverId,
                }
              : {}),
            title: d.title.trim(),
            description: d.description.trim() || null,
          })),
        },
      });
      setDrafts(
        data.rules.map((r) => ({
          id: r.id,
          serverId: r.id,
          title: r.title,
          description: r.description ?? '',
        })),
      );
      setRequireAgreement(data.requireAgreement);
      setDirty(false);
      toast.success(
        t('saved', {
          defaultValue: 'Rules saved',
        }),
      );
      onChange();
    } catch (err) {
      toast.error(
        serverError(err) ??
          t('save-error', {
            defaultValue: "Couldn't save the rules",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (failed) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="t-body text-site-text-muted">
          {t('load-error', {
            defaultValue: "Couldn't load the rules.",
          })}
        </p>
        <Button variant="default" size="sm" onClick={() => void load()}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </Button>
      </div>
    );
  }
  if (!drafts) {
    return (
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }

  const invalid = drafts.some((d) => !d.title.trim());

  return (
    <div className={`flex flex-col gap-4 ${arrival ?? ''}`}>
      <p className="t-meta">
        {t('intro', {
          defaultValue:
            'Rules are shown in the sidebar and to people who join. Members can report a post for breaking one.',
        })}
      </p>

      <div className="flex items-center justify-between gap-3 border-b border-site-border pb-3">
        <span id="rules-require-label" className="t-body text-site-text">
          {t('require-agreement', {
            defaultValue: 'Require agreement on join',
          })}
        </span>
        <Switch
          checked={requireAgreement}
          onCheckedChange={(v) => {
            setRequireAgreement(v);
            setDirty(true);
          }}
          aria-labelledby="rules-require-label"
        />
      </div>

      {drafts.length === 0 ? (
        <p className="t-body text-site-text-muted">
          {t('empty', {
            defaultValue: 'No rules yet. Add the first one below.',
          })}
        </p>
      ) : (
        <SortableList
          items={drafts}
          onReorder={edit}
          itemLabel={(d) => d.title}
          renderItem={(d, index) => (
            <div className="flex items-start gap-2 border-b border-site-border pb-3">
              <span className="t-meta w-5 shrink-0 pt-2.5">{index + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Input
                  dir="auto"
                  value={d.title}
                  maxLength={RULE_TITLE_MAX}
                  onChange={(e) =>
                    edit(
                      drafts.map((x) =>
                        x.id === d.id
                          ? {
                              ...x,
                              title: e.target.value,
                            }
                          : x,
                      ),
                    )
                  }
                  placeholder={t('title-ph', {
                    defaultValue: 'Rule title',
                  })}
                  aria-label={t('title-label', {
                    n: index + 1,
                    defaultValue: 'Title of rule {{n}}',
                  })}
                />
                <Textarea
                  dir="auto"
                  value={d.description}
                  maxLength={RULE_DESCRIPTION_MAX}
                  rows={2}
                  onChange={(e) =>
                    edit(
                      drafts.map((x) =>
                        x.id === d.id
                          ? {
                              ...x,
                              description: e.target.value,
                            }
                          : x,
                      ),
                    )
                  }
                  placeholder={t('description-ph', {
                    defaultValue: 'Description (optional)',
                  })}
                  aria-label={t('description-label', {
                    n: index + 1,
                    defaultValue: 'Description of rule {{n}}',
                  })}
                  className="min-h-0 resize-none px-3 py-2"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('delete', {
                  n: index + 1,
                  defaultValue: 'Delete rule {{n}}',
                })}
                onClick={() => edit(drafts.filter((x) => x.id !== d.id))}
              >
                <Trash2 />
              </Button>
            </div>
          )}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="t-meta">
          {t('count', {
            count: drafts.length,
            max: RULES_MAX,
            defaultValue: '{{count}} of {{max}} rules',
          })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            disabled={drafts.length >= RULES_MAX}
            onClick={() =>
              edit([
                ...drafts,
                {
                  id: newKey(),
                  title: '',
                  description: '',
                },
              ])
            }
          >
            {t('add', {
              defaultValue: 'Add rule',
            })}
          </Button>
          <Button variant="primary" size="sm" loading={saving} disabled={!dirty || invalid} onClick={() => void save()}>
            {t('save', {
              defaultValue: 'Save rules',
            })}
          </Button>
        </div>
      </div>
    </div>
  );
}
