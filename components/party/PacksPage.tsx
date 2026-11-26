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
import { Select } from '@/components/ui/select';
import { CopyButton } from '@/components/ui/copy-button';
import { Spinner } from '@/components/ui/spinner';
import { useSession } from '@/components/Providers';
import { PACK_GAMES, type PackView } from '@/lib/party/packs';
import { isPackGame, parsePackText, type LineError, type PackGame } from '@/lib/party/pack-games';
import { api } from '@/lib/contract/client';
import { createPackApi, listPacksApi, type PackLists } from '@/lib/party/packs.contract';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

/** How many unusable lines and how many usable ones the form lists before it stops. */
const MAX_SHOWN_ERRORS = 5;
const PREVIEW_LINES = 3;

// The dialog carries the report schema (zod), so it loads only when a member opens it.
const ReportDialog = lazy(() =>
  import('@/components/moderation/ReportDialog').then((m) => ({ default: m.ReportDialog })),
);

export function PacksPage() {
  const { t } = useTranslation(['f-party', 'pack-reports', 'more-packs']);
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
  const [game, setGame] = useState<PackGame>('wit-war');
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

  // The same rules the server and the hub apply (`pack-games.ts`), so a line that cannot be used is shown here first.
  const parsed = parsePackText(game, text);
  const prompts = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const errorSentence = (e: LineError): string => {
    const line = e.line;
    const limit = e.limit ?? 0;
    switch (e.code) {
      case 'too-short':
        return t('line-too-short', {
          ns: 'more-packs',
          defaultValue: 'Line {{line}} is too short: at least {{limit}} characters.',
          line,
          limit,
        });
      case 'too-long':
        return t('line-too-long', {
          ns: 'more-packs',
          defaultValue: 'Line {{line}} is too long: at most {{limit}} characters.',
          line,
          limit,
        });
      case 'empty-after-normalising':
        return t('line-empty-after-normalising', {
          ns: 'more-packs',
          defaultValue: 'Line {{line}} has no letters once it is cleaned up.',
          line,
        });
      case 'alias-too-short':
        return t('line-alias-too-short', {
          ns: 'more-packs',
          defaultValue: 'Line {{line}} has an alias under {{limit}} characters.',
          line,
          limit,
        });
      case 'alias-too-long':
        return t('line-alias-too-long', {
          ns: 'more-packs',
          defaultValue: 'Line {{line}} has an alias over {{limit}} characters.',
          line,
          limit,
        });
      case 'too-many-aliases':
        return t('line-too-many-aliases', {
          ns: 'more-packs',
          defaultValue: 'Line {{line}} has more than {{limit}} aliases.',
          line,
          limit,
        });
    }
  };
  const gameLabel = (g: PackGame): string => {
    switch (g) {
      case 'wit-war':
        return t('game-wit-war', { ns: 'more-packs', defaultValue: 'Wit War' });
      case 'identity-crisis':
        return t('game-identity-crisis', { ns: 'more-packs', defaultValue: 'Identity Crisis' });
      case 'human-keyboard':
        return t('game-human-keyboard', { ns: 'more-packs', defaultValue: 'Human Keyboard' });
    }
  };
  const gameHelp = (g: PackGame): string => {
    switch (g) {
      case 'wit-war':
        return t('help-wit-war', {
          ns: 'more-packs',
          defaultValue: 'One prompt per line, 8 to 120 characters. Players write funny answers to them.',
        });
      case 'identity-crisis':
        return t('help-identity-crisis', {
          ns: 'more-packs',
          defaultValue:
            'One person or character per line, 2 to 60 characters. Add other names a guess may use after a bar: Ada Lovelace | Lovelace.',
        });
      case 'human-keyboard':
        return t('help-human-keyboard', {
          ns: 'more-packs',
          defaultValue:
            'One sentence per line. Each is cleaned up to lowercase letters and single spaces, then must be 20 to 60 characters.',
        });
    }
  };
  const linesPlaceholder = (g: PackGame): string => {
    switch (g) {
      case 'wit-war':
        return t('prompts-ph', {
          defaultValue: 'One prompt per line, e.g. The worst thing to say at a job interview',
        });
      case 'identity-crisis':
        return t('ph-identity-crisis', { ns: 'more-packs', defaultValue: 'Ada Lovelace | Lovelace' });
      case 'human-keyboard':
        return t('ph-human-keyboard', {
          ns: 'more-packs',
          defaultValue: 'the quick brown fox jumps over the lazy dog',
        });
    }
  };
  const entriesMeta = (p: PackView): string => {
    switch (isPackGame(p.game) ? p.game : 'wit-war') {
      case 'identity-crisis':
        return t('entries-identity-crisis', {
          ns: 'more-packs',
          defaultValue_one: '{{count}} identity by {{author}}',
          defaultValue: '{{count}} identities by {{author}}',
          count: p.promptCount,
          author: p.author?.name ?? p.author?.handle ?? '?',
        });
      case 'human-keyboard':
        return t('entries-human-keyboard', {
          ns: 'more-packs',
          defaultValue_one: '{{count}} sentence by {{author}}',
          defaultValue: '{{count}} sentences by {{author}}',
          count: p.promptCount,
          author: p.author?.name ?? p.author?.handle ?? '?',
        });
      case 'wit-war':
        return t('pack-meta', {
          defaultValue_one: '{{count}} prompt by {{author}}',
          defaultValue: '{{count}} prompts by {{author}}',
          count: p.promptCount,
          author: p.author?.name ?? p.author?.handle ?? '?',
        });
    }
  };

  async function create() {
    setBusy(true);
    try {
      const { pack } = await api(createPackApi, {
        body: {
          name,
          game,
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
            {isPackGame(p.game) ? gameLabel(p.game) : p.game}
            {' · '}
            {entriesMeta(p)}
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
      description={t('page-desc', {
        ns: 'more-packs',
        defaultValue:
          'Write prompts, identities or sentences for Wit War, Identity Crisis or Human Keyboard, share the code, and the host picks it in the lobby game settings.',
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
            <label className="text-sm text-site-text-muted">
              <span className="mb-2 block">
                {t('game-label', {
                  ns: 'more-packs',
                  defaultValue: 'Game',
                })}
              </span>
              <Select value={game} onChange={(e) => isPackGame(e.target.value) && setGame(e.target.value)}>
                {PACK_GAMES.map((g) => (
                  <option key={g} value={g}>
                    {gameLabel(g)}
                  </option>
                ))}
              </Select>
            </label>
            <p className="t-meta">{gameHelp(game)}</p>
            <Textarea
              dir="auto"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              aria-label={t('lines-label', {
                ns: 'more-packs',
                defaultValue: 'Lines, one per line',
              })}
              placeholder={linesPlaceholder(game)}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="t-meta">
                {t('usable-count', {
                  ns: 'more-packs',
                  defaultValue_one: '{{count}} usable line (need {{min}} to {{max}})',
                  defaultValue: '{{count}} usable lines (need {{min}} to {{max}})',
                  count: parsed.lines.length,
                  min: parsed.min,
                  max: parsed.max,
                })}
              </span>
              <Button
                variant="default"
                disabled={busy || name.trim().length < 3 || !parsed.ok}
                onClick={() => void create()}
              >
                {t('publish', {
                  defaultValue: 'Publish pack',
                })}
              </Button>
            </div>
            {parsed.tooMany ? (
              <p className="t-meta text-site-danger">
                {t('too-many-lines', {
                  ns: 'more-packs',
                  defaultValue: 'A pack holds at most {{max}} lines.',
                  max: parsed.max,
                })}
              </p>
            ) : null}
            {parsed.duplicates > 0 ? (
              <p className="t-meta">
                {t('duplicates', {
                  ns: 'more-packs',
                  defaultValue_one: '{{count}} repeated line is counted once.',
                  defaultValue: '{{count}} repeated lines are counted once.',
                  count: parsed.duplicates,
                })}
              </p>
            ) : null}
            {parsed.errors.length > 0 ? (
              <ul aria-label={t('errors-label', { ns: 'more-packs', defaultValue: 'Lines that cannot be used' })}>
                {parsed.errors.slice(0, MAX_SHOWN_ERRORS).map((e) => (
                  <li key={e.line} className="t-meta border-b border-site-border py-2 text-site-danger">
                    {errorSentence(e)}
                  </li>
                ))}
                {parsed.errors.length > MAX_SHOWN_ERRORS ? (
                  <li className="t-meta py-2">
                    {t('errors-more', {
                      ns: 'more-packs',
                      defaultValue_one: 'and {{count}} more line',
                      defaultValue: 'and {{count}} more lines',
                      count: parsed.errors.length - MAX_SHOWN_ERRORS,
                    })}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {parsed.errors.length === 0 && parsed.lines.length > 0 ? (
              <ul aria-label={t('preview-label', { ns: 'more-packs', defaultValue: 'First lines of the pack' })}>
                {parsed.lines.slice(0, PREVIEW_LINES).map((line) => (
                  <li key={line} dir="auto" className="t-meta truncate border-b border-site-border py-2">
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}
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
