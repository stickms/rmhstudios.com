'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Coins, Heart, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { perkOptions } from './TierEditor';
import type { SerializedTier } from '@/lib/creator/tiers.server';

export interface SupportTierPickerProps {
  creatorId: string;
  tiers: SerializedTier[];
  creatorName?: string | null;
  /** Custom trigger; defaults to a "Support" button. */
  trigger?: React.ReactNode;
  /** Fired after a successful join. */
  onJoined?: (result: { tierId: string; expiresAt: string }) => void;
}

/**
 * A dialog that lets a supporter pick one of a creator's tiers and join it with
 * coins (POST `/api/creators/:id/join`). Renders its own "Support" trigger
 * unless a custom `trigger` is supplied.
 */
export function SupportTierPicker({
  creatorId,
  tiers,
  creatorName,
  trigger,
  onJoined,
}: SupportTierPickerProps) {
  const { t } = useTranslation('site');
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

  const perkMeta = perkOptions(t);
  const perkLabel = (key: string) => perkMeta.find((p) => p.key === key)?.label ?? key;

  const join = async (tierId: string) => {
    setJoining(tierId);
    try {
      const res = await fetch(`/api/creators/${creatorId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('join-failed', { defaultValue: 'Could not join' }));
        return;
      }
      toast.success(
        t('join-success', {
          defaultValue: "You're now a {{tier}} supporter!",
          tier: data.tierName ?? '',
        }),
      );
      onJoined?.({ tierId, expiresAt: data.expiresAt });
      setOpen(false);
    } finally {
      setJoining(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="accent">
            <Heart aria-hidden />
            {t('support', { defaultValue: 'Support' })}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {creatorName
              ? t('support-creator', { defaultValue: 'Support {{name}}', name: creatorName })
              : t('choose-a-tier', { defaultValue: 'Choose a tier' })}
          </DialogTitle>
          <DialogDescription>
            {t('support-picker-desc', {
              defaultValue:
                'Pick a tier to unlock its perks. Membership renews every 30 days with coins.',
            })}
          </DialogDescription>
        </DialogHeader>

        {tiers.length === 0 ? (
          <p className="py-6 text-center text-sm text-site-text-dim">
            {t('no-tiers-available', {
              defaultValue: 'This creator is not offering memberships yet.',
            })}
          </p>
        ) : (
          <div className="space-y-3">
            {tiers.map((tier) => (
              <div key={tier.id} className="rounded-site glass-fill p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-site-text">{tier.name}</h3>
                  <span className="flex items-center gap-1 text-sm font-semibold text-site-text tabular-nums">
                    <Coins className="size-4 text-yellow-500" aria-hidden />
                    {tier.priceCoins}
                    <span className="text-site-text-dim font-normal">
                      {t('per-30-days', { defaultValue: '/ 30d' })}
                    </span>
                  </span>
                </div>
                {tier.perks.length > 0 && (
                  <ul className="space-y-1">
                    {tier.perks.map((perk) => (
                      <li
                        key={perk}
                        className="flex items-center gap-2 text-sm text-site-text-muted"
                      >
                        <Check className="size-4 shrink-0 text-site-success" aria-hidden />
                        {perkLabel(perk)}
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  className="w-full"
                  onClick={() => join(tier.id)}
                  loading={joining === tier.id}
                  disabled={joining !== null}
                >
                  {t('join-tier', {
                    defaultValue: 'Join for {{price}} coins',
                    price: tier.priceCoins,
                  })}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
