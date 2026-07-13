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
import { z } from 'zod';
import { auth } from '@/lib/auth';
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
  if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/settings' } });
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

// updatePrefs parses authoritatively; passthrough here ensures any unknown keys
// from future fields reach the handler without breaking validation.
const doUpdatePrefsSchema = z.object({}).passthrough();

const doKeywordSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('upsert'),
    keyword: z.string().min(1).max(100),
    type: z.enum(['boost', 'block']),
    weight: z.number().int().min(0).max(50),
  }),
  z.object({
    kind: z.literal('delete'),
    keyword: z.string().min(1),
    type: z.enum(['boost', 'block']),
  }),
  z.object({
    kind: z.literal('watchlist'),
    companyId: z.string().min(1).max(100),
    on: z.boolean(),
  }),
]);

const doUpdatePrefs = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doUpdatePrefsSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/settings' } });
    try {
      return { ok: true as const, prefs: await updatePrefs(actionsPrisma, session.user.id, data as PrefsPatch) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

const doKeyword = createServerFn({ method: 'POST' })
  .validator((input: unknown) => doKeywordSchema.parse(input))
  .handler(async ({ data }) => {
    const request = getRequest();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) throw redirect({ to: '/login', search: { callbackURL: '/rmhladder/settings' } });
    if (data.kind === 'upsert') {
      return upsertKeyword(actionsPrisma, session.user.id, data.keyword, data.type, data.weight);
    }
    if (data.kind === 'delete') return deleteKeyword(actionsPrisma, session.user.id, data.keyword, data.type);
    return toggleWatchlist(actionsPrisma, session.user.id, data.companyId, data.on);
  });

export const Route = createFileRoute('/_site/rmhladder/settings')({
  loader: () => fetchSettings(),
  component: SettingsPage,
});

const DIGESTS = ['immediate', 'daily', 'weekly'] as const;
const PROGRAM_TYPES = [
  'internship', 'summer_analyst', 'summer_associate', 'analyst_program', 'rotational_program',
  'new_grad', 'leadership_development', 'entry_level', 'mba', 'other',
] as const;

function SettingsPage() {
  const loaded = Route.useLoaderData();
  const router = useRouter();

  const [prefs, setPrefs] = useState<AnyRow>(loaded.prefs as AnyRow);
  const [keywords, setKeywords] = useState<AnyRow[]>(loaded.keywords as AnyRow[]);
  const [error, setError] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState({ text: '', type: 'boost' as 'boost' | 'block', weight: 10 });
  const [watchlistCompanyIds, setWatchlistCompanyIds] = useState<string[]>(loaded.watchlistCompanyIds);
  const [watchlistChoice, setWatchlistChoice] = useState('');
  const [savedSearches, setSavedSearches] = useState<AnyRow[]>(loaded.savedSearches as AnyRow[]);

  async function patchPrefs(patch: PrefsPatch) {
    setError(null);
    const previous = prefs;
    setPrefs((p) => ({ ...p, ...patch }));
    const result = await doUpdatePrefs({ data: patch });
    if (!result.ok) {
      setPrefs(previous);
      setError(result.error ?? 'Save failed');
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
    await doKeyword({ data: { kind: 'upsert', keyword, type: newKeyword.type, weight: newKeyword.weight } });
    await router.invalidate();
  }

  async function removeKeyword(keyword: string, type: 'boost' | 'block') {
    setKeywords((prev) => prev.filter((k) => !(k.keyword === keyword && k.type === type)));
    await doKeyword({ data: { kind: 'delete', keyword, type } });
    await router.invalidate();
  }

  async function setWatchlist(companyId: string, on: boolean) {
    if (!companyId) return;
    setWatchlistCompanyIds((current) => on
      ? [...new Set([...current, companyId])]
      : current.filter((id) => id !== companyId));
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
      setError('Could not update saved search');
      return;
    }
    setSavedSearches((rows) => rows.map((row) => row.id === search.id ? { ...row, alertsOn } : row));
  }

  async function deleteSavedSearch(id: string) {
    const response = await fetch(`/api/rmhladder/searches?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) {
      setError('Could not delete saved search');
      return;
    }
    setSavedSearches((rows) => rows.filter((row) => row.id !== id));
  }

  const threshold = (prefs.relevanceThreshold as number) ?? 60;
  const cities = ((prefs.preferredCities as string[]) ?? []).join(', ');
  const programTypes = (prefs.preferredProgramTypes as string[]) ?? [];

  return (
    <div>
      {error && <p className="rl-review-error rl-mono">{error}</p>}

      <div className="rl-settings-grid">
        <section className="rl-settings-section">
          <h2 className="rl-eyebrow">Relevance</h2>

          <label className="rl-field" htmlFor="rl-threshold">
            <span className="rl-eyebrow">
              Alert threshold · <span className="rl-mono">{threshold}</span>
            </span>
            <input
              id="rl-threshold"
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setPrefs((p) => ({ ...p, relevanceThreshold: Number(e.target.value) }))}
              onMouseUp={() => void patchPrefs({ relevanceThreshold: threshold })}
              onTouchEnd={() => void patchPrefs({ relevanceThreshold: threshold })}
              onKeyUp={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') void patchPrefs({ relevanceThreshold: threshold });
              }}
            />
          </label>

          <label className="rl-field" htmlFor="rl-cities">
            <span className="rl-eyebrow">Preferred cities (comma-separated)</span>
            <input
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

          <fieldset className="rl-field">
            <legend className="rl-eyebrow">Program types</legend>
            <div className="rl-chip-row">
              {PROGRAM_TYPES.map((pt) => {
                const on = programTypes.includes(pt);
                return (
                  <button
                    key={pt}
                    type="button"
                    className={`rl-chip${on ? ' rl-chip--active' : ''}`}
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
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="rl-field" htmlFor="rl-timezone">
            <span className="rl-eyebrow">Timezone</span>
            <input
              id="rl-timezone"
              type="text"
              defaultValue={(prefs.timezone as string) ?? 'America/New_York'}
              placeholder="America/New_York"
              onBlur={(e) => void patchPrefs({ timezone: e.target.value.trim() || 'America/New_York' })}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="rl-field" htmlFor="rl-quiet-start">
              <span className="rl-eyebrow">Quiet hours start</span>
              <select
                id="rl-quiet-start"
                className="rl-sort-select"
                value={prefs.quietHoursStart == null ? '' : String(prefs.quietHoursStart)}
                onChange={(e) => void patchPrefs({ quietHoursStart: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Off</option>
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <label className="rl-field" htmlFor="rl-quiet-end">
              <span className="rl-eyebrow">Quiet hours end</span>
              <select
                id="rl-quiet-end"
                className="rl-sort-select"
                value={prefs.quietHoursEnd == null ? '' : String(prefs.quietHoursEnd)}
                onChange={(e) => void patchPrefs({ quietHoursEnd: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Off</option>
                {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
              </select>
            </label>
          </div>

          <label className="rl-field" htmlFor="rl-resume-threshold">
            <span className="rl-eyebrow">Minimum resume match (optional)</span>
            <input
              id="rl-resume-threshold"
              type="number"
              min={0}
              max={100}
              value={prefs.resumeMatchThreshold == null ? '' : Number(prefs.resumeMatchThreshold)}
              placeholder="Any match"
              onChange={(e) => setPrefs((value) => ({ ...value, resumeMatchThreshold: e.target.value === '' ? null : Number(e.target.value) }))}
              onBlur={(e) => void patchPrefs({ resumeMatchThreshold: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
        </section>

        <section className="rl-settings-section">
          <h2 className="rl-eyebrow">Alerts</h2>

          <fieldset className="rl-field">
            <legend className="rl-eyebrow">Digest</legend>
            <div className="rl-chip-row">
              {DIGESTS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`rl-chip${prefs.digestFrequency === d ? ' rl-chip--active' : ''}`}
                  aria-pressed={prefs.digestFrequency === d}
                  onClick={() => void patchPrefs({ digestFrequency: d })}
                >
                  {d}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="rl-field">
            <legend className="rl-eyebrow">Channels</legend>
            <div className="rl-chip-row">
              {([
                ['channelInApp', 'In-app'],
                ['channelEmail', 'Email'],
                ['channelDiscord', 'Discord'],
              ] as const).map(([key, label]) => {
                const on = prefs[key] === true;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`rl-chip${on ? ' rl-chip--active' : ''}`}
                    aria-pressed={on}
                    onClick={() => void patchPrefs({ [key]: !on } as PrefsPatch)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="rl-quicklist__empty">
            Discord alerts use the Discord account linked to your RMH Studios sign-in; arbitrary user IDs are never messaged.
          </p>

          <p className="rl-quicklist__empty">
            Use boost keywords below to prioritize companies, skills, and role families.
          </p>
        </section>

        <section className="rl-settings-section rl-settings-section--wide">
          <h2 className="rl-eyebrow">Keywords</h2>

          <div className="rl-keyword-add">
            <input
              type="text"
              aria-label="New keyword"
              placeholder="e.g. equity research"
              value={newKeyword.text}
              onChange={(e) => setNewKeyword((k) => ({ ...k, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addKeyword();
              }}
            />
            <select
              aria-label="Keyword type"
              className="rl-sort-select"
              value={newKeyword.type}
              onChange={(e) => setNewKeyword((k) => ({ ...k, type: e.target.value as 'boost' | 'block' }))}
            >
              <option value="boost">boost</option>
              <option value="block">block</option>
            </select>
            <input
              type="number"
              aria-label="Keyword weight"
              min={0}
              max={50}
              value={newKeyword.weight}
              disabled={newKeyword.type === 'block'}
              onChange={(e) => setNewKeyword((k) => ({ ...k, weight: Number(e.target.value) }))}
            />
            <button type="button" className="rl-chip" onClick={() => void addKeyword()}>
              Add
            </button>
          </div>

          <div className="rl-chip-row">
            {keywords.map((k) => (
              <span
                key={`${k.type as string}-${k.keyword as string}`}
                className={`rl-keyword-chip${k.type === 'block' ? ' rl-keyword-chip--block' : ''}`}
              >
                {k.keyword as string}
                {k.type === 'boost' && <span className="rl-mono"> +{k.weight as number}</span>}
                <button
                  type="button"
                  aria-label={`Remove keyword ${k.keyword as string}`}
                  onClick={() => void removeKeyword(k.keyword as string, k.type as 'boost' | 'block')}
                >
                  ×
                </button>
              </span>
            ))}
            {keywords.length === 0 && (
              <p className="rl-quicklist__empty">No keywords yet. Boosts raise a match's score; blocks hide it.</p>
            )}
          </div>
        </section>

        <section className="rl-settings-section rl-settings-section--wide">
          <h2 className="rl-eyebrow">Company watchlist</h2>
          <p className="rl-quicklist__empty">Watchlisted companies receive a ranking boost in your job feed.</p>
          <div className="rl-keyword-add">
            <select
              aria-label="Choose a company to watch"
              className="rl-sort-select"
              value={watchlistChoice}
              onChange={(event) => setWatchlistChoice(event.target.value)}
            >
              <option value="">Choose a company…</option>
              {loaded.companies
                .filter((company) => !watchlistCompanyIds.includes(company.id))
                .map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <button type="button" className="rl-chip" disabled={!watchlistChoice} onClick={() => void setWatchlist(watchlistChoice, true)}>
              Watch
            </button>
          </div>
          <div className="rl-chip-row">
            {watchlistCompanyIds.map((companyId) => {
              const company = loaded.companies.find((candidate) => candidate.id === companyId);
              return (
                <span key={companyId} className="rl-keyword-chip">
                  {company?.name ?? 'Company'}
                  <button type="button" aria-label={`Stop watching ${company?.name ?? 'company'}`} onClick={() => void setWatchlist(companyId, false)}>×</button>
                </span>
              );
            })}
          </div>
        </section>

        <section className="rl-settings-section rl-settings-section--wide">
          <h2 className="rl-eyebrow">Saved searches</h2>
          {savedSearches.length === 0 ? (
            <p className="rl-quicklist__empty">Save filters from the Jobs page to manage their alerts here.</p>
          ) : (
            <div className="space-y-2">
              {savedSearches.map((search) => (
                <div key={search.id as string} className="flex min-h-14 flex-wrap items-center gap-3 rounded-site-sm border border-site-border p-3">
                  <span className="mr-auto font-medium">{search.name as string}</span>
                  <button
                    type="button"
                    className={`rl-chip${search.alertsOn ? ' rl-chip--active' : ''}`}
                    aria-pressed={Boolean(search.alertsOn)}
                    onClick={() => void updateSavedSearch(search, !search.alertsOn)}
                  >
                    Alerts {search.alertsOn ? 'on' : 'off'}
                  </button>
                  <button type="button" className="rl-chip" onClick={() => void deleteSavedSearch(search.id as string)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
