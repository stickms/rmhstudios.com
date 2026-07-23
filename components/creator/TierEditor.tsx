'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Lock,
  MessagesSquare,
  Rocket,
  Plus,
  Trash2,
  Coins,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SerializedTier, PerkKey } from '@/lib/creator/tiers.server';

// Client-side mirrors of the server bounds (importing the server module's
// values into a client bundle would resolve to `undefined`). The server is the
// authority — these only drive inline hints and control ranges.
const MAX_TIERS = 3;
const TIER_PRICE_MIN = 100;
const TIER_PRICE_MAX = 10_000;

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Perk enum → display metadata. Shared with {@link SupportTierPicker} so the
 * creator's editor and the supporter's picker label perks identically. The keys
 * are the fixed `PerkKey` enum; kept in sync with `PERK_KEYS` server-side.
 */
export function perkOptions(
  t: TFn,
): { key: PerkKey; label: string; description: string; icon: LucideIcon }[] {
  return [
    {
      key: 'badge',
      label: t('perk-badge', { defaultValue: 'Supporter badge' }),
      description: t('perk-badge-desc', { defaultValue: 'A badge by their name in your threads' }),
      icon: BadgeCheck,
    },
    {
      key: 'posts',
      label: t('perk-posts', { defaultValue: 'Supporters-only posts' }),
      description: t('perk-posts-desc', { defaultValue: 'Posts you mark supporters-only' }),
      icon: Lock,
    },
    {
      key: 'chat',
      label: t('perk-chat', { defaultValue: 'Supporters chat' }),
      description: t('perk-chat-desc', { defaultValue: 'A private channel for your supporters' }),
      icon: MessagesSquare,
    },
    {
      key: 'early_builds',
      label: t('perk-early-builds', { defaultValue: 'Early access to builds' }),
      description: t('perk-early-builds-desc', {
        defaultValue: 'See new builds before everyone else',
      }),
      icon: Rocket,
    },
  ];
}

interface Draft {
  /** Stable local key for React lists (not persisted). */
  key: string;
  /** Server id when editing an existing tier; undefined for a new one. */
  id?: string;
  name: string;
  priceCoins: number;
  perks: PerkKey[];
}

function toDraft(tier: SerializedTier, key: string): Draft {
  return { key, id: tier.id, name: tier.name, priceCoins: tier.priceCoins, perks: tier.perks };
}

export interface TierEditorProps {
  initialTiers: SerializedTier[];
  /** Called with the saved tier set after a successful PUT. */
  onSaved?: (tiers: SerializedTier[]) => void;
}

/**
 * Controlled editor for a creator's up-to-three membership tiers. Manages the
 * draft list locally and PUTs the whole set to `/api/studio/tiers` on save.
 */
export function TierEditor({ initialTiers, onSaved }: TierEditorProps) {
  const { t } = useTranslation('site');
  const keyCounter = useRef(0);
  const nextKey = useCallback(() => `tier-${keyCounter.current++}`, []);

  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (initialTiers.length > 0 ? initialTiers : []).map((tier) =>
      toDraft(tier, `tier-${keyCounter.current++}`),
    ),
  );
  const [saving, setSaving] = useState(false);

  const perks = perkOptions(t);

  const update = useCallback((key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }, []);

  const addTier = useCallback(() => {
    setDrafts((prev) =>
      prev.length >= MAX_TIERS
        ? prev
        : [
            ...prev,
            {
              key: nextKey(),
              name: t('new-tier-name', { defaultValue: 'Supporter' }),
              priceCoins: 500,
              perks: ['badge'] as PerkKey[],
            },
          ],
    );
  }, [nextKey, t]);

  const removeTier = useCallback((key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }, []);

  const togglePerk = useCallback((key: string, perk: PerkKey) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d;
        const has = d.perks.includes(perk);
        return { ...d, perks: has ? d.perks.filter((p) => p !== perk) : [...d.perks, perk] };
      }),
    );
  }, []);

  const invalid = drafts.some(
    (d) => !d.name.trim() || d.priceCoins < TIER_PRICE_MIN || d.priceCoins > TIER_PRICE_MAX,
  );

  const save = useCallback(async () => {
    if (drafts.length === 0) {
      toast.error(t('tiers-need-one', { defaultValue: 'Add at least one tier' }));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/studio/tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiers: drafts.map((d, i) => ({
            id: d.id,
            name: d.name.trim(),
            priceCoins: d.priceCoins,
            perks: d.perks,
            sortOrder: i,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('tiers-save-failed', { defaultValue: 'Could not save tiers' }));
        return;
      }
      const saved: SerializedTier[] = data.tiers ?? [];
      setDrafts(saved.map((tier) => toDraft(tier, nextKey())));
      onSaved?.(saved);
      toast.success(t('tiers-saved', { defaultValue: 'Tiers saved' }));
    } finally {
      setSaving(false);
    }
  }, [drafts, nextKey, onSaved, t]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-site-text">
          {t('membership-tiers', { defaultValue: 'Membership tiers' })}
        </h2>
        <p className="text-sm text-site-text-dim">
          {t('membership-tiers-desc', {
            defaultValue:
              'Offer up to three tiers. Supporters pay coins every 30 days to unlock the perks you choose.',
          })}
        </p>
      </div>

      {drafts.length === 0 && (
        <div className="rounded-site  p-6 text-center text-sm text-site-text-dim">
          {t('no-tiers-yet', {
            defaultValue: 'No tiers yet. Add your first tier to start earning from supporters.',
          })}
        </div>
      )}

      <div className="space-y-4">
        {drafts.map((d, i) => {
          const nameInvalid = !d.name.trim();
          const priceInvalid = d.priceCoins < TIER_PRICE_MIN || d.priceCoins > TIER_PRICE_MAX;
          return (
            <div key={d.key} className="rounded-site  p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-site-text-dim">
                  {t('tier-n', { defaultValue: 'Tier {{n}}', n: i + 1 })}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeTier(d.key)}
                  aria-label={t('remove-tier', { defaultValue: 'Remove tier' })}
                >
                  <Trash2 className="text-site-danger" aria-hidden />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${d.key}-name`}>
                    {t('tier-name', { defaultValue: 'Name' })}
                  </Label>
                  <Input
                    id={`${d.key}-name`}
                    value={d.name}
                    maxLength={40}
                    aria-invalid={nameInvalid || undefined}
                    onChange={(e) => update(d.key, { name: e.target.value })}
                    placeholder={t('tier-name-ph', { defaultValue: 'e.g. Supporter' })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${d.key}-price`}>
                    {t('tier-price', { defaultValue: 'Price (coins / 30 days)' })}
                  </Label>
                  <Input
                    id={`${d.key}-price`}
                    type="number"
                    min={TIER_PRICE_MIN}
                    max={TIER_PRICE_MAX}
                    step={50}
                    value={d.priceCoins}
                    aria-invalid={priceInvalid || undefined}
                    onChange={(e) =>
                      update(d.key, { priceCoins: Math.floor(Number(e.target.value) || 0) })
                    }
                  />
                  {priceInvalid && (
                    <p className="text-xs text-site-danger">
                      {t('tier-price-range', {
                        defaultValue: 'Between {{min}} and {{max}} coins',
                        min: TIER_PRICE_MIN,
                        max: TIER_PRICE_MAX,
                      })}
                    </p>
                  )}
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-site-text mb-1">
                  {t('tier-perks', { defaultValue: 'Perks' })}
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {perks.map(({ key, label, description, icon: Icon }) => {
                    const checked = d.perks.includes(key);
                    return (
                      <label
                        key={key}
                        aria-label={label}
                        className={`flex items-start gap-3 rounded-site px-3 py-2.5 cursor-pointer transition-colors ${
                          checked ? 'bg-site-accent-dim' : ' hover:bg-site-surface-hover'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 accent-[var(--site-accent)]"
                          checked={checked}
                          onChange={() => togglePerk(d.key, key)}
                        />
                        <span className="min-w-0">
                          <span
                            className={`flex items-center gap-1.5 text-sm font-medium ${
                              checked ? 'text-site-accent' : 'text-site-text'
                            }`}
                          >
                            <Icon className="size-4 shrink-0" aria-hidden />
                            {label}
                          </span>
                          <span className="block text-xs text-site-text-dim">{description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Button variant="secondary" onClick={addTier} disabled={drafts.length >= MAX_TIERS}>
          <Plus aria-hidden />
          {t('add-tier', { defaultValue: 'Add tier' })}
          <span className="text-site-text-dim">
            {drafts.length}/{MAX_TIERS}
          </span>
        </Button>
        <Button onClick={save} loading={saving} disabled={invalid || drafts.length === 0}>
          <Coins aria-hidden />
          {t('save-tiers', { defaultValue: 'Save tiers' })}
        </Button>
      </div>
    </div>
  );
}
