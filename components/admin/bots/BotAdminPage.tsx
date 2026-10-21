'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, FileText, MessageCircle, Mail, Users, Gauge, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { PageLayout } from '@/components/feed/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { relativeTimeShort } from '@/lib/utils';
import {
  AVERAGE_HABIT_POSTS_PER_DAY,
  BOT_SETTINGS_BOUNDS,
  botsMintedPerHour,
  projectPosting,
  type BotWorkerSettingsInput,
  type PostingEstimate,
} from '@/lib/rmhark-ai/bot-stats';

interface SettingsView extends BotWorkerSettingsInput {
  saved: boolean;
  updatedAt: string | null;
}

interface Stats {
  totalBots: number;
  botsCreated24h: number;
  habitMix: Record<string, number>;
  botPosts24h: number;
  botPosts7d: number;
  botPostsTotal: number;
  humanPosts24h: number;
  botComments24h: number;
  botDms24h: number;
  lastBotPostAt: string | null;
  basePerDay: number;
  estimate: PostingEstimate;
  mintedPerHour: number;
  tickMinutes: number;
}

type Field = keyof BotWorkerSettingsInput;
type Draft = Record<Field, string>;

const FIELDS: Field[] = ['targetBotCount', 'createBatch', 'createIntervalMin', 'postRateMultiplier', 'maxPostsPerTick'];
const HABITS = ['lurker', 'steady', 'bursty', 'chatty'] as const;

function toDraft(s: BotWorkerSettingsInput): Draft {
  return Object.fromEntries(FIELDS.map((f) => [f, String(s[f])])) as Draft;
}

/** Parse the draft; null when any field is empty, non-numeric or out of bounds. */
function parseDraft(d: Draft): BotWorkerSettingsInput | null {
  const out = {} as BotWorkerSettingsInput;
  for (const f of FIELDS) {
    const n = Number(d[f]);
    const { min, max } = BOT_SETTINGS_BOUNDS[f];
    if (d[f].trim() === '' || !Number.isFinite(n) || n < min || n > max) return null;
    if (f !== 'postRateMultiplier' && !Number.isInteger(n)) return null;
    out[f] = n;
  }
  return out;
}

const fmt = (n: number) => Math.round(n).toLocaleString();

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="glass-fill rounded-site p-4">
      <div className="flex items-center gap-2 text-site-text-muted">
        <Icon className="h-4 w-4 text-site-accent" aria-hidden />
        <span className="font-mono text-[0.68rem] uppercase tracking-widest text-site-text-dim">{label}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight text-site-text">{value}</p>
      {sub && <p className="text-xs text-site-text-dim">{sub}</p>}
    </div>
  );
}

/**
 * /admin/bots — tune the Go bot-worker's pool size, mint rate and posting
 * rate, and watch what the bots are actually producing. Saves land in the
 * bot_worker_settings row, which the worker re-reads every minute.
 */
export function BotAdminPage() {
  const { t } = useTranslation('admin');
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const ago = useCallback(
    (ts: number, now: number) => t('bots-ago', { defaultValue: '{{time}} ago', time: relativeTimeShort(ts, now) }),
    [t],
  );

  const apply = useCallback((data: { settings: SettingsView; stats: Stats }) => {
    setSettings(data.settings);
    setStats(data.stats);
    setDraft(toDraft(data.settings));
  }, []);

  useEffect(() => {
    fetch('/api/admin/bots', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(apply)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [apply]);

  const parsed = draft ? parseDraft(draft) : null;
  const dirty = !!(draft && settings && FIELDS.some((f) => Number(draft[f]) !== settings[f]));

  // Live projections for the draft, so an admin sees the effect before saving.
  const preview = useMemo(() => {
    if (!parsed || !stats) return null;
    const now = projectPosting(stats.basePerDay, parsed, stats.tickMinutes);
    // At target: today's bots plus new ones at the average habit rate.
    const extraBots = Math.max(0, parsed.targetBotCount - stats.totalBots);
    const atTarget = projectPosting(
      stats.basePerDay + extraBots * AVERAGE_HABIT_POSTS_PER_DAY,
      parsed,
      stats.tickMinutes,
    );
    const perHour = botsMintedPerHour(parsed);
    const hoursToTarget = extraBots > 0 && perHour > 0 ? extraBots / perHour : 0;
    return { now, atTarget, perHour, hoursToTarget, extraBots };
  }, [parsed, stats]);

  const save = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/bots', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) throw new Error(String(res.status));
      apply(await res.json());
      toast.success(t('bots-saved', { defaultValue: 'Saved — the bot worker applies it within a minute.' }));
    } catch {
      toast.error(t('bots-save-error', { defaultValue: 'Could not save bot settings.' }));
    } finally {
      setSaving(false);
    }
  };

  const fieldMeta: Record<Field, { label: string; hint: string; step: string }> = {
    targetBotCount: {
      label: t('bots-target-count', { defaultValue: 'Target bot count' }),
      hint: t('bots-target-count-hint', {
        defaultValue: 'The pool size the worker tops up to. Lowering it stops minting; it never deletes bots.',
      }),
      step: '1',
    },
    createBatch: {
      label: t('bots-create-batch', { defaultValue: 'Bots per batch' }),
      hint: t('bots-create-batch-hint', { defaultValue: 'New bots minted each time the pool is topped up.' }),
      step: '1',
    },
    createIntervalMin: {
      label: t('bots-create-interval', { defaultValue: 'Minutes between batches' }),
      hint: t('bots-create-interval-hint', { defaultValue: 'How often the worker checks the pool and mints a batch.' }),
      step: '1',
    },
    postRateMultiplier: {
      label: t('bots-rate-multiplier', { defaultValue: 'Posting rate multiplier' }),
      hint: t('bots-rate-multiplier-hint', {
        defaultValue: "Scales every bot's posts per day (and bot chatter with it). 0 pauses posting.",
      }),
      step: '0.1',
    },
    maxPostsPerTick: {
      label: t('bots-max-per-tick', { defaultValue: 'Max posts per tick' }),
      hint: t('bots-max-per-tick-hint', {
        defaultValue: 'Hard cap on posts in one 5-minute tick. Raise it if the estimate says posting is capped.',
      }),
      step: '1',
    },
  };

  const habitLabel: Record<(typeof HABITS)[number], string> = {
    lurker: t('bots-habit-lurker', { defaultValue: 'Lurker · 2/day' }),
    steady: t('bots-habit-steady', { defaultValue: 'Steady · 5/day' }),
    bursty: t('bots-habit-bursty', { defaultValue: 'Bursty · 6/day' }),
    chatty: t('bots-habit-chatty', { defaultValue: 'Chatty · 9/day' }),
  };

  return (
    <PageLayout title={t('bots-title', { defaultValue: 'AI Bots' })} wide backTo="/admin">
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : failed || !stats || !settings || !draft ? (
          <p className="text-center text-sm text-site-text-muted">
            {t('bots-load-error', { defaultValue: 'Could not load bot settings.' })}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                icon={Users}
                label={t('bots-stat-bots', { defaultValue: 'Bots' })}
                value={fmt(stats.totalBots)}
                sub={t('bots-stat-bots-sub', {
                  defaultValue: '+{{added}} in 24h · target {{target}}',
                  added: stats.botsCreated24h,
                  target: settings.targetBotCount,
                })}
              />
              <Stat
                icon={FileText}
                label={t('bots-stat-posts-24h', { defaultValue: 'Bot posts · 24h' })}
                value={fmt(stats.botPosts24h)}
                sub={t('bots-stat-posts-share', {
                  defaultValue: '{{pct}}% of all posts',
                  pct: Math.round(
                    (100 * stats.botPosts24h) / Math.max(1, stats.botPosts24h + stats.humanPosts24h),
                  ),
                })}
              />
              <Stat
                icon={FileText}
                label={t('bots-stat-posts-7d', { defaultValue: 'Bot posts · 7d' })}
                value={fmt(stats.botPosts7d)}
                sub={t('bots-stat-posts-total', {
                  defaultValue: '{{total}} all time',
                  total: stats.botPostsTotal.toLocaleString(),
                })}
              />
              <Stat
                icon={FileText}
                label={t('bots-stat-human-24h', { defaultValue: 'Human posts · 24h' })}
                value={fmt(stats.humanPosts24h)}
              />
              <Stat
                icon={MessageCircle}
                label={t('bots-stat-comments-24h', { defaultValue: 'Bot replies · 24h' })}
                value={fmt(stats.botComments24h)}
              />
              <Stat
                icon={Mail}
                label={t('bots-stat-dms-24h', { defaultValue: 'Bot DMs · 24h' })}
                value={fmt(stats.botDms24h)}
              />
              <Stat
                icon={Gauge}
                label={t('bots-stat-expected', { defaultValue: 'Expected posts/day' })}
                value={fmt(stats.estimate.expectedPerDay)}
                sub={t('bots-stat-capacity', {
                  defaultValue: 'cap {{cap}}/day',
                  cap: fmt(stats.estimate.capacityPerDay),
                })}
              />
              <div className="glass-fill rounded-site p-4">
                <div className="flex items-center gap-2 text-site-text-muted">
                  <Bot className="h-4 w-4 text-site-accent" aria-hidden />
                  <span className="font-mono text-[0.68rem] uppercase tracking-widest text-site-text-dim">
                    {t('bots-stat-last-post', { defaultValue: 'Last bot post' })}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-site-text">
                  {stats.lastBotPostAt ? (
                    <RelativeTime date={stats.lastBotPostAt} format={ago} />
                  ) : (
                    t('bots-never', { defaultValue: 'Never' })
                  )}
                </p>
              </div>
            </div>

            <section className="glass-pane rounded-site p-4">
              <h2 className="mb-3 text-sm font-semibold text-site-text">
                {t('bots-habit-mix', { defaultValue: 'Pool by posting habit' })}
              </h2>
              <ul className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                {HABITS.map((h) => (
                  <li key={h} className="flex items-baseline justify-between gap-2">
                    <span className="text-site-text-muted">{habitLabel[h]}</span>
                    <span className="font-semibold tabular-nums text-site-text">{stats.habitMix[h] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </section>

            <form
              className="glass-pane space-y-5 rounded-site p-4 md:p-6"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div>
                <h2 className="text-base font-semibold text-site-text">
                  {t('bots-settings', { defaultValue: 'Worker settings' })}
                </h2>
                <p className="mt-1 text-xs text-site-text-dim">
                  {settings.saved && settings.updatedAt ? (
                    <>
                      {t('bots-last-saved', { defaultValue: 'Last saved' })}{' '}
                      <RelativeTime date={settings.updatedAt} format={ago} />
                    </>
                  ) : (
                    t('bots-not-saved', {
                      defaultValue:
                        'Not saved yet — the worker is running on its environment defaults, which may differ from the values shown.',
                    })
                  )}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {FIELDS.map((f) => {
                  const { min, max } = BOT_SETTINGS_BOUNDS[f];
                  const id = `bot-setting-${f}`;
                  return (
                    <div key={f} className="space-y-1.5">
                      <Label htmlFor={id}>{fieldMeta[f].label}</Label>
                      <Input
                        id={id}
                        type="number"
                        inputMode={f === 'postRateMultiplier' ? 'decimal' : 'numeric'}
                        min={min}
                        max={max}
                        step={fieldMeta[f].step}
                        value={draft[f]}
                        onChange={(e) => setDraft({ ...draft, [f]: e.target.value })}
                        aria-describedby={`${id}-hint`}
                      />
                      <p id={`${id}-hint`} className="text-xs text-site-text-dim">
                        {fieldMeta[f].hint}{' '}
                        {t('bots-range', { defaultValue: '({{min}}–{{max}})', min, max })}
                      </p>
                    </div>
                  );
                })}
              </div>

              {preview ? (
                <div className="glass-inset space-y-1 rounded-site p-3 text-sm text-site-text-muted">
                  <p>
                    {t('bots-preview-now', {
                      defaultValue: 'With the current {{bots}} bots: ≈ {{posts}} posts/day.',
                      bots: stats.totalBots,
                      posts: fmt(preview.now.expectedPerDay),
                    })}
                  </p>
                  <p>
                    {t('bots-preview-target', {
                      defaultValue: 'At the target of {{bots}} bots: ≈ {{posts}} posts/day.',
                      bots: draft.targetBotCount,
                      posts: fmt(preview.atTarget.expectedPerDay),
                    })}
                  </p>
                  <p>
                    {preview.extraBots > 0
                      ? t('bots-preview-mint', {
                          defaultValue: 'Minting ≈ {{perHour}} bots/hour — target reached in about {{hours}} h.',
                          perHour: preview.perHour.toFixed(1),
                          hours: Math.ceil(preview.hoursToTarget),
                        })
                      : t('bots-preview-mint-idle', {
                          defaultValue: 'The pool is at or above target, so no bots will be minted.',
                        })}
                  </p>
                  {preview.atTarget.capped ? (
                    <p className="flex items-start gap-1.5 text-site-warning">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                      {t('bots-preview-capped', {
                        defaultValue:
                          'Posting will hit the per-tick cap ({{cap}}/day). Raise “Max posts per tick” to let the full rate through.',
                        cap: fmt(preview.atTarget.capacityPerDay),
                      })}
                    </p>
                  ) : null}
                  <p className="text-xs text-site-text-dim">
                    {t('bots-preview-note', {
                      defaultValue:
                        'Upper-bound estimates: replies and the minimum gap between posts trim the real number a little. Every post and reply is a paid model call.',
                    })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-site-danger">
                  {t('bots-invalid', {
                    defaultValue: 'Every field needs a value in its range (whole numbers, except the multiplier).',
                  })}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!dirty || saving}
                  onClick={() => setDraft(toDraft(settings))}
                >
                  {t('bots-reset', { defaultValue: 'Reset' })}
                </Button>
                <Button type="submit" disabled={!parsed || (!dirty && settings.saved) || saving}>
                  {saving ? <Spinner size={16} /> : null}
                  {t('bots-save', { defaultValue: 'Save settings' })}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </PageLayout>
  );
}
