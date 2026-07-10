/**
 * RMH Ladder — Settings.
 *
 * Relevance threshold, digest cadence, channels, preferred cities/programs,
 * and the boost/block keyword manager. Watchlist is managed on Companies.
 */

import { useState } from 'react';
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
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
  return getSettings(queriesPrisma, session.user.id);
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
    return deleteKeyword(actionsPrisma, session.user.id, data.keyword, data.type);
  });

export const Route = createFileRoute('/rmhladder/settings')({
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

  const threshold = (prefs.relevanceThreshold as number) ?? 60;
  const cities = ((prefs.preferredCities as string[]) ?? []).join(', ');
  const programTypes = (prefs.preferredProgramTypes as string[]) ?? [];

  return (
    <div>
      <div className="rl-page-header">
        <p className="rl-eyebrow">RMHLADDER · SETTINGS</p>
        <h1 className="rl-display">Settings</h1>
      </div>

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

          <label className="rl-field" htmlFor="rl-discord-id">
            <span className="rl-eyebrow">Discord user ID</span>
            <input
              id="rl-discord-id"
              type="text"
              defaultValue={(prefs.discordUserId as string) ?? ''}
              onBlur={(e) => void patchPrefs({ discordUserId: e.target.value || null })}
            />
          </label>

          <p className="rl-quicklist__empty">
            Watchlist lives on the <Link to="/rmhladder/companies">Companies page</Link> — star a firm to boost it.
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
      </div>
    </div>
  );
}
