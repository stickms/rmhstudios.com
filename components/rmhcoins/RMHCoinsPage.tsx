'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { CoinIcon } from './CoinIcon';
import { PlinkoGame } from './PlinkoGame';
import { CoinShop } from './CoinShop';

type Tab = 'shop' | 'play';

const tabs: { label: string; value: Tab }[] = [
  { label: 'Shop', value: 'shop' },
  { label: 'Play', value: 'play' },
];

export function RMHCoinsPage({ defaultTab = 'shop' }: { defaultTab?: Tab }) {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [coins, setCoins] = useState(0);
  const [hasProfilePet, setHasProfilePet] = useState(false);
  const [loading, setLoading] = useState(true);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session?.user) {
      navigate({ to: '/login', search: { callbackURL: '/wallet' } });
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
    <div className="flex flex-col w-full">
      {/* Balance bar */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-site-border">
        <div className="flex items-center gap-2">
          <CoinIcon className="w-6 h-6" />
          <span className="font-bold text-2xl text-yellow-500">{coins}</span>
          <span className="text-sm text-site-text-dim ml-1">RMH Coins</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-site-border">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-1 py-3 text-center text-sm font-bold transition-colors relative ${
                tab === t.value
                  ? 'text-yellow-500'
                  : 'text-site-text-dim hover:text-site-text hover:bg-site-surface/50'
              }`}
            >
              {t.label}
              {tab === t.value && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-yellow-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {tab === 'shop' && (
          <CoinShop
            coins={coins}
            setCoins={setCoins}
            hasProfilePet={hasProfilePet}
            setHasProfilePet={setHasProfilePet}
          />
        )}
        {tab === 'play' && <PlinkoGame coins={coins} setCoins={setCoins} />}
      </div>
    </div>
  );
}
