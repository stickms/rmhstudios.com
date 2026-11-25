import { useRefusalText } from '@/components/errors/useRefusalText';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Flag, Sparkles, Star, Trash2, EyeOff } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { Cells, Section } from '@/components/ui/rules';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { PACK_MAX_PROMPTS, PACK_MIN_PROMPTS, type PackView } from '@/lib/party/packs';
import { api } from '@/lib/contract/client';
import { createPackApi, listPacksApi, type PackLists } from '@/lib/party/packs.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

// The dialog carries the report schema (zod), so it loads only when a member opens it.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

export function PacksPage() {
  const { t } = useTranslation(['f-party', 'pack-reports']);
  const refusalText = useRefusalText();
  const session = useSession();
  const signedIn = !!session.data?.user;
  const isAdmin = !!(
    session.data?.user as
      | {
          isAdmin?: boolean;
        }
      | undefined
  )?.isAdmin;
  const [lists, setLists] = useState<PackLists | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const arrival = useArrival(lists !== null);

  const load = useCallback(async () => {
    try {
      setLists(await api(listPacksApi));
    } catch {
      toast.error(
        t('load-failed', {
          defaultValue: 'Could not load packs.',
        }),
      );
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load, signedIn]);

  const prompts = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  async function create() {
    setBusy(true);
    try {
      const { pack } = await api(createPackApi, {
        body: {
          name,
          game: 'wit-war',
          prompts,
        },
      });
      setBusy(false);
      toast.success(
        t('created', {
          defaultValue: 'Pack created. Share code {{code}}.',
          code: pack.code,
        }),
      );
      setName('');
      setText('');
      void load();
    } catch (e) {
      setBusy(false);
      toast.error(
        refusalText.maybe(e) ??
          t('create-failed', {
            defaultValue: 'Could not create the pack.',
          }),
      );
    }
  }

  async function act(pack: PackView, action: 'delete' | 'feature' | 'hide') {
    const url = `/api/rmhbox/packs/${pack.id}`;
    const res = await fetch(
      url,
      action === 'delete'
        ? {
            method: 'DELETE',
          }
        : {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(
              action === 'feature'
                ? {
                    featured: !pack.featured,
                  }
                : {
                    hidden: !pack.hidden,
                  },
            ),
          },
    ).catch(() => null);
    if (res?.ok) {
      void load();
    } else
      toast.error(
        t('action-failed', {
          defaultValue: 'That did not work.',
        }),
      );
  }

  const card = (p: PackView) => (
    <li key={p.id} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 dir="auto" className="truncate font-semibold text-site-text">
            {p.name}
          </h3>
          <p className="text-xs text-site-text-muted">
            {t('pack-meta', {
              defaultValue_one: '{{count}} prompt by {{author}}',
              defaultValue: '{{count}} prompts by {{author}}',
              count: p.promptCount,
              author: p.author?.name ?? p.author?.handle ?? '?',
            })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {p.featured ? (
            <Badge variant="default">
              {t('featured', {
                defaultValue: 'Featured',
              })}
            </Badge>
          ) : null}
          {p.hidden ? (
            <Badge variant="danger">
              {t('hidden', {
                defaultValue: 'Hidden',
              })}
            </Badge>
          ) : null}
        </div>
      </div>
      {p.moderated ? (
        <p className="t-meta">
          {t('removed-line', {
            ns: 'pack-reports',
            defaultValue: 'Removed by a moderator',
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <code className="surface-field rounded-site px-3 py-2 font-mono text-sm text-site-text">{p.code}</code>
        <CopyButton
          value={p.code}
          size="xs"
          variant="default"
          label={t('copy-code', {
            defaultValue: 'Copy code',
          })}
        />
        {signedIn && !p.mine ? (
          <Button size="xs" variant="ghost" onClick={() => setReporting(p.id)}>
            <Flag aria-hidden />
            {t('report', {
              defaultValue: 'Report',
            })}
          </Button>
        ) : null}
        {p.mine || isAdmin ? (
          <Button size="xs" variant="ghost" onClick={() => void act(p, 'delete')}>
            <Trash2 aria-hidden />
            {t('delete', {
              defaultValue: 'Delete',
            })}
          </Button>
        ) : null}
        {isAdmin && !p.moderated ? (
          <>
            <Button size="xs" variant="default" onClick={() => void act(p, 'feature')}>
              <Star aria-hidden />
              {p.featured
                ? t('unfeature', {
                    defaultValue: 'Unfeature',
                  })
                : t('feature', {
                    defaultValue: 'Feature',
                  })}
            </Button>
            <Button size="xs" variant="default" onClick={() => void act(p, 'hide')}>
              <EyeOff aria-hidden />
              {p.hidden
                ? t('unhide', {
                    defaultValue: 'Unhide',
                  })
                : t('hide', {
                    defaultValue: 'Hide',
                  })}
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );

  const section = (title: string, items: PackView[], empty: string) => (
    <section className={cn('space-y-3', arrival)}>
      <h2 className="site-section-label">{title}</h2>
      {items.length ? (
        <Cells columns={2}>{items.map(card)}</Cells>
      ) : (
        <p className="text-sm text-site-text-muted">{empty}</p>
      )}
    </section>
  );

  return (
    <PageLayout
      title={t('packs-title', {
        defaultValue: 'RMHBox prompt packs',
      })}
      description={t('packs-desc', {
        defaultValue:
          'Write your own Wit-War prompts, share the code, and the host picks it in the lobby game settings.',
      })}
    >
      <div className="space-y-6 px-4 pt-4 pb-12">
        {signedIn ? (
          <Section className="flex flex-col gap-3">
            <h2 className="site-section-label flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-site-accent" aria-hidden />
              {t('new-pack', {
                defaultValue: 'Make a pack',
              })}
            </h2>
            <Input
              dir="auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={t('name-ph', {
                defaultValue: 'Pack name',
              })}
              aria-label={t('name-ph', {
                defaultValue: 'Pack name',
              })}
            />
            <Textarea
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              aria-label={t('prompts-label', {
                defaultValue: 'Prompts, one per line',
              })}
              placeholder={t('prompts-ph', {
                defaultValue: 'One prompt per line, e.g. The worst thing to say at a job interview',
              })}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-site-text-muted">
                {t('prompt-count', {
                  defaultValue_one: '{{count}} prompt (need {{min}} to {{max}})',
                  defaultValue: '{{count}} prompts (need {{min}} to {{max}})',
                  count: prompts.length,
                  min: PACK_MIN_PROMPTS,
                  max: PACK_MAX_PROMPTS,
                })}
              </span>
              <Button
                variant="default"
                disabled={
                  busy ||
                  name.trim().length < 3 ||
                  prompts.length < PACK_MIN_PROMPTS ||
                  prompts.length > PACK_MAX_PROMPTS
                }
                onClick={() => void create()}
              >
                {t('publish', {
                  defaultValue: 'Publish pack',
                })}
              </Button>
            </div>
          </Section>
        ) : (
          <p className="text-sm text-site-text-muted">
            {t('sign-in', {
              defaultValue: 'Sign in to make and report packs.',
            })}
          </p>
        )}
        {signedIn ? (
          <p className="t-meta">
            {t('report-desc', {
              defaultValue: 'Packs with several reports are hidden until a moderator reviews them.',
            })}
          </p>
        ) : null}
        {!lists ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {signedIn
              ? section(
                  t('mine', {
                    defaultValue: 'Your packs',
                  }),
                  lists.mine,
                  t('mine-empty', {
                    defaultValue: 'You have not made a pack yet.',
                  }),
                )
              : null}
            {section(
              t('featured-shelf', {
                defaultValue: 'Featured packs',
              }),
              lists.featured,
              t('featured-empty', {
                defaultValue: 'Nothing featured yet.',
              }),
            )}
            {section(
              t('community', {
                defaultValue: 'Community packs',
              }),
              lists.recent,
              t('community-empty', {
                defaultValue: 'No community packs yet.',
              }),
            )}
          </>
        )}
      </div>
      {reporting ? (
        <Suspense fallback={null}>
          <ReportDialog
            open
            onOpenChange={(open) => {
              if (!open) setReporting(null);
            }}
            entityType="rmhbox-pack"
            entityId={reporting}
          />
        </Suspense>
      ) : null}
    </PageLayout>
  );
}
