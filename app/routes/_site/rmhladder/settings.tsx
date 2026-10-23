/**
 * RMH Ladder — Settings.
 *
 * Relevance threshold, digest cadence, channels, preferred cities/programs,
 * and the boost/block keyword manager. Watchlist is managed on Companies.
 */

import { useState } from 'react';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import {
  doKeywordSchema,
  doUpdatePrefsSchema,
} from '@/lib/rmhladder/server-fn-schemas.server';
import { auth } from '@/lib/auth';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { prisma } from '@/lib/prisma.server';
import { getSettings, type QueriesPrisma } from '@/lib/rmhladder/server/queries';
import {
  updatePrefs,
  upsertKeyword,
  deleteKeyword,
  toggleWatchlist,
  type ActionsPrisma,
  type PrefsPatch,
} from '@/lib/rmhladder/server/actions';

const queriesPrisma = prisma as unknown as QueriesPrisma;
const actionsPrisma = prisma as unknown as ActionsPrisma;

type AnyRow = Record<string, unknown>;

const fetchSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/settings' } });
  const [settings, companies, savedSearches] = await Promise.all([
    getSettings(queriesPrisma, session.user.id),
    prisma.ladderCompany.findMany({
      where: { enabled: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.ladderSavedSearch.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, filters: true, alertsOn: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
  ]);
  return { ...settings, companies, savedSearches };
});

const doUpdatePrefs = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doUpdatePrefsSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user)
      throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/settings' } });
    try {
      return {
        ok: true as const,
        prefs: await updatePrefs(actionsPrisma, session.user.id, data as PrefsPatch),
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

const doKeyword = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doKeywordSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user)
      throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/settings' } });
    if (data.kind === 'upsert') {
      return upsertKeyword(actionsPrisma, session.user.id, data.keyword, data.type, data.weight);
    }
    if (data.kind === 'delete')
      return deleteKeyword(actionsPrisma, session.user.id, data.keyword, data.type);
    return toggleWatchlist(actionsPrisma, session.user.id, data.companyId, data.on);
  });

export const Route = createFileRoute('/_site/rmhladder/settings')({
  loader: () => fetchSettings(),
  component: SettingsPage,
});

const DIGESTS = ['immediate', 'daily', 'weekly'] as const;
const PROGRAM_TYPES = [
  'internship',
  'summer_analyst',
  'summer_associate',
  'analyst_program',
  'rotational_program',
  'new_grad',
  'leadership_development',
  'entry_level',
  'mba',
  'other',
] as const;

function SettingsPage() {
  const { t } = useTranslation('site');
  const loaded = Route.useLoaderData();
  const router = useRouter();

  const [prefs, setPrefs] = useState<AnyRow>(loaded.prefs as AnyRow);
  const [keywords, setKeywords] = useState<AnyRow[]>(loaded.keywords as AnyRow[]);
  const [error, setError] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState({
    text: '',
    type: 'boost' as 'boost' | 'block',
    weight: 10,
  });
  const [watchlistCompanyIds, setWatchlistCompanyIds] = useState<string[]>(
    loaded.watchlistCompanyIds,
  );
  const [watchlistChoice, setWatchlistChoice] = useState('');
  const [savedSearches, setSavedSearches] = useState<AnyRow[]>(loaded.savedSearches as AnyRow[]);

  async function patchPrefs(patch: PrefsPatch) {
    setError(null);
    const previous = prefs;
    setPrefs((p) => ({ ...p, ...patch }));
    const result = await doUpdatePrefs({ data: patch });
    if (!result.ok) {
      setPrefs(previous);
      setError(result.error ?? t('ladder.settings.saveFailed', { defaultValue: 'Save failed' }));
      return;
    }
    await router.invalidate();
  }

  async function addKeyword() {
    const keyword = newKeyword.text.trim().toLowerCase();
    if (!keyword) return;
    setKeywords((prev) => [
      ...prev.filter((k) => !(k.keyword === keyword && k.type === newKeyword.type)),
      { id: `tmp-${keyword}`, keyword, type: newKeyword.type, weight: newKeyword.weight },
    ]);
    setNewKeyword((k) => ({ ...k, text: '' }));
    await doKeyword({
      data: { kind: 'upsert', keyword, type: newKeyword.type, weight: newKeyword.weight },
    });
    await router.invalidate();
  }

  async function removeKeyword(keyword: string, type: 'boost' | 'block') {
    setKeywords((prev) => prev.filter((k) => !(k.keyword === keyword && k.type === type)));
    await doKeyword({ data: { kind: 'delete', keyword, type } });
    await router.invalidate();
  }

  async function setWatchlist(companyId: string, on: boolean) {
    if (!companyId) return;
    setWatchlistCompanyIds((current) =>
      on ? [...new Set([...current, companyId])] : current.filter((id) => id !== companyId),
    );
    await doKeyword({ data: { kind: 'watchlist', companyId, on } });
    setWatchlistChoice('');
    await router.invalidate();
  }

  async function updateSavedSearch(search: AnyRow, alertsOn: boolean) {
    const response = await fetch('/api/rmhladder/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: search.id,
        name: search.name,
        filters: search.filters,
        alertsOn,
      }),
    });
    if (!response.ok) {
      setError(t('ladder.settings.updateSearchFailed', { defaultValue: 'Could not update saved search' }));
      return;
    }
    setSavedSearches((rows) =>
      rows.map((row) => (row.id === search.id ? { ...row, alertsOn } : row)),
    );
  }

  async function deleteSavedSearch(id: string) {
    const response = await fetch(`/api/rmhladder/searches?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setError(t('ladder.settings.deleteSearchFailed', { defaultValue: 'Could not delete saved search' }));
      return;
    }
    setSavedSearches((rows) => rows.filter((row) => row.id !== id));
  }

  const threshold = (prefs.relevanceThreshold as number) ?? 60;
  const cities = ((prefs.preferredCities as string[]) ?? []).join(', ');
  const programTypes = (prefs.preferredProgramTypes as string[]) ?? [];

  const sectionCls = 'glass-fill flex flex-col gap-4 rounded-site p-4 sm:p-5';
  const fieldCls = 'flex flex-col gap-2 border-0 p-0 m-0';
  const labelCls = 'text-sm font-medium text-site-text';
  const hintCls = 'text-sm text-site-text-muted';

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-site-danger">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className={sectionCls} aria-labelledby="rl-set-relevance">
          <h2 id="rl-set-relevance" className="site-section-label">
            {t('ladder.settings.relevance', { defaultValue: 'Relevance' })}
          </h2>

          <label className={fieldCls} htmlFor="rl-threshold">
            <span className={labelCls}>
              {t('ladder.settings.threshold', { defaultValue: 'Alert threshold' })} ·{' '}
              <span className="rl-mono">{threshold}</span>
            </span>
            <input
              id="rl-threshold"
              type="range"
              className="accent-site-accent"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, relevanceThreshold: Number(e.target.value) }))
              }
              onMouseUp={() => void patchPrefs({ relevanceThreshold: threshold })}
              onTouchEnd={() => void patchPrefs({ relevanceThreshold: threshold })}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
                  void patchPrefs({ relevanceThreshold: threshold });
              }}
            />
          </label>

          <label className={fieldCls} htmlFor="rl-cities">
            <span className={labelCls}>
              {t('ladder.settings.cities', { defaultValue: 'Preferred cities (comma-separated)' })}
            </span>
            <Input
              id="rl-cities"
              type="text"
              defaultValue={cities}
              onBlur={(e) =>
                void patchPrefs({
                  preferredCities: e.target.value
                    .split(',')
                    .map((c) => c.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>

          <fieldset className={fieldCls}>
            <legend className={`${labelCls} mb-2`}>
              {t('ladder.settings.programTypes', { defaultValue: 'Program types' })}
            </legend>
            <div className="flex flex-wrap gap-2">
              {PROGRAM_TYPES.map((pt) => {
                const on = programTypes.includes(pt);
                return (
                  <Button
                    key={pt}
                    type="button"
                    size="sm"
                    variant={on ? 'accent' : 'outline'}
                    className="min-h-11"
                    aria-pressed={on}
                    onClick={() =>
                      void patchPrefs({
                        preferredProgramTypes: (on
                          ? programTypes.filter((p) => p !== pt)
                          : [...programTypes, pt]) as PrefsPatch['preferredProgramTypes'],
                      })
                    }
                  >
                    {pt.replace(/_/g, ' ')}
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <label className={fieldCls} htmlFor="rl-timezone">
            <span className={labelCls}>
              {t('ladder.settings.timezone', { defaultValue: 'Timezone' })}
            </span>
            <Input
              id="rl-timezone"
              type="text"
              defaultValue={(prefs.timezone as string) ?? 'America/New_York'}
              placeholder="America/New_York"
              onBlur={(e) =>
                void patchPrefs({ timezone: e.target.value.trim() || 'America/New_York' })
              }
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={fieldCls} htmlFor="rl-quiet-start">
              <span className={labelCls}>
                {t('ladder.settings.quietStart', { defaultValue: 'Quiet hours start' })}
              </span>
              <Select
                id="rl-quiet-start"
                value={prefs.quietHoursStart == null ? '' : String(prefs.quietHoursStart)}
                onChange={(e) =>
                  void patchPrefs({
                    quietHoursStart: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">{t('ladder.settings.off', { defaultValue: 'Off' })}</option>
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </Select>
            </label>
            <label className={fieldCls} htmlFor="rl-quiet-end">
              <span className={labelCls}>
                {t('ladder.settings.quietEnd', { defaultValue: 'Quiet hours end' })}
              </span>
              <Select
                id="rl-quiet-end"
                value={prefs.quietHoursEnd == null ? '' : String(prefs.quietHoursEnd)}
                onChange={(e) =>
                  void patchPrefs({
                    quietHoursEnd: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">{t('ladder.settings.off', { defaultValue: 'Off' })}</option>
                {Array.from({ length: 24 }, (_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, '0')}:00
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <label className={fieldCls} htmlFor="rl-resume-threshold">
            <span className={labelCls}>
              {t('ladder.settings.resumeMatch', { defaultValue: 'Minimum resume match (optional)' })}
            </span>
            <Input
              id="rl-resume-threshold"
              type="number"
              min={0}
              max={100}
              value={prefs.resumeMatchThreshold == null ? '' : Number(prefs.resumeMatchThreshold)}
              placeholder={t('ladder.settings.anyMatch', { defaultValue: 'Any match' })}
              onChange={(e) =>
                setPrefs((value) => ({
                  ...value,
                  resumeMatchThreshold: e.target.value === '' ? null : Number(e.target.value),
                }))
              }
              onBlur={(e) =>
                void patchPrefs({
                  resumeMatchThreshold: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </section>

        <section className={`${sectionCls} self-start`} aria-labelledby="rl-set-alerts">
          <h2 id="rl-set-alerts" className="site-section-label">
            {t('ladder.settings.alerts', { defaultValue: 'Alerts' })}
          </h2>

          <fieldset className={fieldCls}>
            <legend className={`${labelCls} mb-2`}>
              {t('ladder.settings.digest', { defaultValue: 'Digest' })}
            </legend>
            <div className="flex flex-wrap gap-2">
              {DIGESTS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={prefs.digestFrequency === d ? 'accent' : 'outline'}
                  className="min-h-11"
                  aria-pressed={prefs.digestFrequency === d}
                  onClick={() => void patchPrefs({ digestFrequency: d })}
                >
                  {d}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className={fieldCls}>
            <legend className={`${labelCls} mb-2`}>
              {t('ladder.settings.channels', { defaultValue: 'Channels' })}
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['channelInApp', t('ladder.settings.channelInApp', { defaultValue: 'In-app' })],
                  ['channelEmail', t('ladder.settings.channelEmail', { defaultValue: 'Email' })],
                  ['channelDiscord', 'Discord'],
                ] as const
              ).map(([key, label]) => {
                const on = prefs[key] === true;
                return (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={on ? 'accent' : 'outline'}
                    className="min-h-11"
                    aria-pressed={on}
                    onClick={() => void patchPrefs({ [key]: !on } as PrefsPatch)}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </fieldset>

          <p className={hintCls}>
            {t('ladder.settings.discordNote', {
              defaultValue:
                'Discord alerts use the Discord account linked to your RMH Studios sign-in; arbitrary user IDs are never messaged.',
            })}
          </p>

          <p className={hintCls}>
            {t('ladder.settings.boostNote', {
              defaultValue:
                'Use boost keywords below to prioritize companies, skills, and role families.',
            })}
          </p>
        </section>

        <section className={`${sectionCls} md:col-span-2`} aria-labelledby="rl-set-keywords">
          <h2 id="rl-set-keywords" className="site-section-label">
            {t('ladder.settings.keywords', { defaultValue: 'Keywords' })}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              className="w-full sm:w-64"
              aria-label={t('ladder.settings.newKeyword', { defaultValue: 'New keyword' })}
              placeholder={t('ladder.settings.keywordPlaceholder', {
                defaultValue: 'e.g. equity research',
              })}
              value={newKeyword.text}
              onChange={(e) => setNewKeyword((k) => ({ ...k, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addKeyword();
              }}
            />
            <Select
              aria-label={t('ladder.settings.keywordType', { defaultValue: 'Keyword type' })}
              value={newKeyword.type}
              onChange={(e) =>
                setNewKeyword((k) => ({ ...k, type: e.target.value as 'boost' | 'block' }))
              }
            >
              <option value="boost">{t('ladder.settings.boost', { defaultValue: 'boost' })}</option>
              <option value="block">{t('ladder.settings.block', { defaultValue: 'block' })}</option>
            </Select>
            <Input
              type="number"
              className="w-24"
              aria-label={t('ladder.settings.keywordWeight', { defaultValue: 'Keyword weight' })}
              min={0}
              max={50}
              value={newKeyword.weight}
              disabled={newKeyword.type === 'block'}
              onChange={(e) => setNewKeyword((k) => ({ ...k, weight: Number(e.target.value) }))}
            />
            <Button type="button" variant="outline" onClick={() => void addKeyword()}>
              {t('ladder.settings.add', { defaultValue: 'Add' })}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {keywords.map((k) => (
              <span
                key={`${k.type as string}-${k.keyword as string}`}
                className={`inline-flex items-center gap-2 rounded-site-sm border py-1 pr-1 pl-3 text-sm ${
                  k.type === 'block'
                    ? 'border-site-danger/30 bg-site-danger/10'
                    : 'border-site-accent/30 bg-site-accent-dim'
                }`}
              >
                {k.keyword as string}
                {k.type === 'boost' && <span className="rl-mono">+{k.weight as number}</span>}
                <button
                  type="button"
                  className="touch-target inline-flex size-8 items-center justify-center rounded-site-sm text-site-text-muted transition-colors hover:text-site-text"
                  aria-label={t('ladder.settings.removeKeyword', {
                    defaultValue: 'Remove keyword {{keyword}}',
                    keyword: k.keyword as string,
                  })}
                  onClick={() =>
                    void removeKeyword(k.keyword as string, k.type as 'boost' | 'block')
                  }
                >
                  <X className="size-4" aria-hidden />
                </button>
              </span>
            ))}
            {keywords.length === 0 && (
              <p className={hintCls}>
                {t('ladder.settings.noKeywords', {
                  defaultValue: "No keywords yet. Boosts raise a match's score; blocks hide it.",
                })}
              </p>
            )}
          </div>
        </section>

        <section className={`${sectionCls} md:col-span-2`} aria-labelledby="rl-set-watchlist">
          <h2 id="rl-set-watchlist" className="site-section-label">
            {t('ladder.settings.watchlist', { defaultValue: 'Company watchlist' })}
          </h2>
          <p className={hintCls}>
            {t('ladder.settings.watchlistNote', {
              defaultValue: 'Watchlisted companies receive a ranking boost in your job feed.',
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t('ladder.settings.chooseCompany', {
                defaultValue: 'Choose a company to watch',
              })}
              value={watchlistChoice}
              onChange={(event) => setWatchlistChoice(event.target.value)}
            >
              <option value="">
                {t('ladder.settings.chooseCompanyOption', { defaultValue: 'Choose a company…' })}
              </option>
              {loaded.companies
                .filter((company) => !watchlistCompanyIds.includes(company.id))
                .map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              disabled={!watchlistChoice}
              onClick={() => void setWatchlist(watchlistChoice, true)}
            >
              {t('ladder.settings.watch', { defaultValue: 'Watch' })}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {watchlistCompanyIds.map((companyId) => {
              const company = loaded.companies.find((candidate) => candidate.id === companyId);
              const name = company?.name ?? t('ladder.settings.company', { defaultValue: 'Company' });
              return (
                <span
                  key={companyId}
                  className="inline-flex items-center gap-2 rounded-site-sm border border-site-accent/30 bg-site-accent-dim py-1 pr-1 pl-3 text-sm"
                >
                  {name}
                  <button
                    type="button"
                    className="touch-target inline-flex size-8 items-center justify-center rounded-site-sm text-site-text-muted transition-colors hover:text-site-text"
                    aria-label={t('ladder.settings.stopWatching', {
                      defaultValue: 'Stop watching {{name}}',
                      name,
                    })}
                    onClick={() => void setWatchlist(companyId, false)}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              );
            })}
          </div>
        </section>

        <section className={`${sectionCls} md:col-span-2`} aria-labelledby="rl-set-searches">
          <h2 id="rl-set-searches" className="site-section-label">
            {t('ladder.settings.savedSearches', { defaultValue: 'Saved searches' })}
          </h2>
          {savedSearches.length === 0 ? (
            <p className={hintCls}>
              {t('ladder.settings.noSearches', {
                defaultValue: 'Save filters from the Jobs page to manage their alerts here.',
              })}
            </p>
          ) : (
            <ul className="space-y-2">
              {savedSearches.map((search) => (
                <li
                  key={search.id as string}
                  className="glass-inset flex min-h-14 flex-wrap items-center gap-2 rounded-site-sm px-3 py-2"
                >
                  <span className="mr-auto font-medium">{search.name as string}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={search.alertsOn ? 'accent' : 'outline'}
                    className="min-h-11"
                    aria-pressed={Boolean(search.alertsOn)}
                    onClick={() => void updateSavedSearch(search, !search.alertsOn)}
                  >
                    {search.alertsOn
                      ? t('ladder.settings.alertsOn', { defaultValue: 'Alerts on' })
                      : t('ladder.settings.alertsOff', { defaultValue: 'Alerts off' })}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => void deleteSavedSearch(search.id as string)}
                  >
                    {t('ladder.settings.delete', { defaultValue: 'Delete' })}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
