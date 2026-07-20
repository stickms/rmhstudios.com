'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Award } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  AWARD_CATALOG,
  getAward,
  type AwardEntityType,
  type AwardGroup,
} from '@/lib/awards/catalog';

interface Summary {
  groups: AwardGroup[];
  total: number;
}

/**
 * PostAwards (§7) — the public award badge row for a piece of content plus the
 * give-award picker (a G1 glass sheet). Self-contained: fetches its own summary
 * for one entity (used on detail pages; feed-wide server hydration is the
 * adoption follow-up). Signed-in non-owners can give awards.
 */
export function PostAwards({
  entityType,
  entityId,
  canGive = true,
  initial,
}: {
  entityType: AwardEntityType;
  entityId: string;
  /** Hide the give button (e.g. the viewer owns the content). */
  canGive?: boolean;
  initial?: Summary;
}) {
  const { t } = useTranslation('c-awards');
  const [summary, setSummary] = useState<Summary | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch(`/api/awards?entityType=${entityType}&entityId=${encodeURIComponent(entityId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Summary | null) => {
        if (!cancelled && data) setSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, initial]);

  async function give(awardId: string) {
    setBusy(awardId);
    try {
      const res = await fetch('/api/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId, entityType, entityId, anonymous }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'give failed');
      }
      // Optimistically bump the local summary.
      setSummary((prev) => {
        const groups = prev ? [...prev.groups] : [];
        const g = groups.find((x) => x.awardId === awardId);
        if (g) g.count += 1;
        else groups.push({ awardId, count: 1 });
        return { groups, total: (prev?.total ?? 0) + 1 };
      });
      setOpen(false);
      toast.success(t('given', { defaultValue: 'Award given — thank you!' }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(
        msg === 'INSUFFICIENT_COINS'
          ? t('insufficient', { defaultValue: "You don't have enough coins" })
          : msg === 'SELF_AWARD'
            ? t('self', { defaultValue: "You can't award your own content" })
            : t('error', { defaultValue: "Couldn't give the award" }),
      );
    } finally {
      setBusy(null);
    }
  }

  const groups = summary?.groups ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {groups.slice(0, 4).map((g) => {
        const def = getAward(g.awardId);
        if (!def) return null;
        return (
          <span
            key={g.awardId}
            className="glass-fill inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm"
            title={def.name}
          >
            <span aria-hidden>{def.emoji}</span>
            <span className="text-xs text-site-text-muted">{g.count}</span>
          </span>
        );
      })}
      {groups.length > 4 ? (
        <span className="text-xs text-site-text-dim">
          +{groups.slice(4).reduce((s, g) => s + g.count, 0)}
        </span>
      ) : null}

      {canGive ? (
        <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
          <Award className="h-4 w-4" aria-hidden />
          {t('give', { defaultValue: 'Give award' })}
        </Button>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('give-title', { defaultValue: 'Give an award' })}</SheetTitle>
            <SheetDescription>
              {t('give-desc', {
                defaultValue: 'Awards on removed content are not refunded.',
              })}
            </SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-3 gap-2 py-2">
            {AWARD_CATALOG.map((def) => (
              <button
                key={def.id}
                type="button"
                disabled={busy !== null}
                onClick={() => give(def.id)}
                className={cn(
                  'glass-fill flex flex-col items-center gap-1 rounded-site py-3 transition-colors hover:border-site-border-bright',
                  busy === def.id && 'opacity-60',
                )}
              >
                <span className="text-2xl" aria-hidden>
                  {def.emoji}
                </span>
                <span className="text-xs font-medium text-site-text">{def.name}</span>
                <span className="text-xs text-site-text-muted">{def.priceCoins}</span>
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between gap-4 border-t border-site-border pt-3">
            <span className="text-sm text-site-text">
              {t('anonymous', { defaultValue: 'Give anonymously' })}
            </span>
            <Switch checked={anonymous} onCheckedChange={setAnonymous} />
          </label>
        </SheetContent>
      </Sheet>
    </div>
  );
}
