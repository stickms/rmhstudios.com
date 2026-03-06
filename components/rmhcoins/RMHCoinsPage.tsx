'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { CoinIcon } from './CoinIcon';
import { PlinkoGame } from './PlinkoGame';
import { CoinShop } from './CoinShop';

type Tab = 'play' | 'shop';

export function RMHCoinsPage() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('play');
  const [coins, setCoins] = useState(0);
  const [hasProfilePet, setHasProfilePet] = useState(false);
  const [loading, setLoading] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate({ to: '/login', search: { callbackURL: '/rmhcoins' } });
    }
  }, [isPending, session, navigate]);

  // Fetch coin balance
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/coins')
      .then((r) => r.json())
      .then((data) => {
        setCoins(data.coins ?? 0);
        setHasProfilePet(data.hasProfilePet ?? false);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session]);

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-site-accent animate-spin" />
      </div>
    );
  }

  if (!session?.user) return null;

  return (
    <div className="flex flex-col max-w-lg mx-auto w-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            RMH Coins
          </h1>
          <div className="flex items-center gap-1.5">
            <CoinIcon className="w-5 h-5" />
            <span className="font-bold text-lg text-yellow-500">{coins}</span>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-site-border">
        <div className="flex">
          <button
            onClick={() => setTab('play')}
            className={`flex-1 py-3 text-center text-sm font-bold transition-colors ${
              tab === 'play'
                ? 'text-yellow-500 border-b-2 border-yellow-500'
                : 'text-site-text-dim hover:text-site-text hover:bg-site-surface/50'
            }`}
          >
            Play
          </button>
          <button
            onClick={() => setTab('shop')}
            className={`flex-1 py-3 text-center text-sm font-bold transition-colors ${
              tab === 'shop'
                ? 'text-yellow-500 border-b-2 border-yellow-500'
                : 'text-site-text-dim hover:text-site-text hover:bg-site-surface/50'
            }`}
          >
            Shop
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === 'play' && <PlinkoGame coins={coins} setCoins={setCoins} />}
      {tab === 'shop' && (
        <CoinShop
          coins={coins}
          setCoins={setCoins}
          hasProfilePet={hasProfilePet}
          setHasProfilePet={setHasProfilePet}
        />
      )}
    </div>
  );
}
