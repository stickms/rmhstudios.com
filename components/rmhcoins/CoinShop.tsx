'use client';

import { useState } from 'react';
import { Loader2, Check, Dog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import { ProfilePet } from './ProfilePet';
import { toast } from 'sonner';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
  hasProfilePet: boolean;
  setHasProfilePet: (val: boolean) => void;
}

export function CoinShop({ coins, setCoins, hasProfilePet, setHasProfilePet }: Props) {
  const [buyingPet, setBuyingPet] = useState(false);
  const [claimingCoins, setClaimingCoins] = useState(false);

  const handleBuyPet = async () => {
    if (buyingPet || hasProfilePet || coins < 50) return;
    setBuyingPet(true);
    try {
      const res = await fetch('/api/coins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: 'profile-pet' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Purchase failed');
        return;
      }
      setCoins(data.newBalance);
      setHasProfilePet(true);
      toast.success('Profile Pet purchased!');
    } catch {
      toast.error('Network error');
    } finally {
      setBuyingPet(false);
    }
  };

  const handleClaimCoins = async () => {
    if (claimingCoins || coins >= 10) return;
    setClaimingCoins(true);
    try {
      const res = await fetch('/api/coins/claim', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Claim failed');
        return;
      }
      setCoins(data.newBalance);
      toast.success('+10 coins added!');
    } catch {
      toast.error('Network error');
    } finally {
      setClaimingCoins(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      {/* Profile Pet Card */}
      <div className="bg-site-surface border border-site-border rounded-xl p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Dog className="w-5 h-5 text-yellow-500" />
            <h3 className="font-bold text-site-text">Profile Pet</h3>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-yellow-500">50</span>
            <CoinIcon className="w-4 h-4" />
          </div>
        </div>

        <p className="text-sm text-site-text-dim mb-3">
          An 8-bit dog runs around on a grassy strip on your profile! Visible to everyone who visits.
        </p>

        {/* Preview */}
        <div className="mb-3">
          <ProfilePet />
        </div>

        {/* Buy button */}
        {hasProfilePet ? (
          <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-500">
            <Check className="w-4 h-4" />
            Owned
          </div>
        ) : (
          <Button
            onClick={handleBuyPet}
            disabled={coins < 50 || buyingPet}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg disabled:opacity-50"
          >
            {buyingPet ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : coins < 50 ? (
              `Not enough coins (need 50)`
            ) : (
              'Buy for 50 coins'
            )}
          </Button>
        )}
      </div>

      {/* Get More Coins */}
      {coins < 10 && (
        <div className="bg-site-surface border border-site-border rounded-xl p-4">
          <h3 className="font-bold text-site-text mb-2">Get More Coins</h3>
          <p className="text-sm text-site-text-dim mb-3">
            Running low? Claim 10 free coins to keep playing.
          </p>
          <Button
            onClick={handleClaimCoins}
            disabled={claimingCoins}
            variant="outline"
            className="w-full rounded-lg border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
          >
            {claimingCoins ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Claim 10 Free Coins'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
