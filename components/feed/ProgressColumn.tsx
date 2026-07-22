'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Zap,
  Target,
  Trophy,
  Lock,
  Check,
  Gift,
  Sparkles,
  CalendarDays,
  CalendarRange,
  Crown,
} from 'lucide-react';
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { DailyWheel } from './DailyWheel';
import { StakingCard } from './StakingCard';
import { ColumnHeader } from './ColumnHeader';

interface QuestView {
  id: string;
  period: 'daily' | 'weekly';
  name: string;
  description: string;
  target: number;
  xp: number;
  coins: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

interface LevelInfo {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
}

interface ProgressPayload {
  level: LevelInfo;
  coins: number;
  quests: QuestView[];
  season: {
    id: string;
    name: string;
    endsAt: string;
    seasonXp: number;
    tier: number;
    maxTier: number;
    premium: boolean;
  };
}

interface PassReward {
  type: 'coins' | 'item' | 'xp' | 'badge';
  amount?: number;
  itemId?: string;
  label: string;
}
interface PassTier {
  tier: number;
  xpRequired: number;
  free: PassReward | null;
  premium: PassReward | null;
}
interface BattlePassPayload {
  season: { id: string; name: string; endsAt: string; premiumPrice: number; xpPerTier: number };
  tiers: PassTier[];
  seasonXp: number;
  currentTier: number;
  premium: boolean;
  claimedFree: number[];
  claimedPaid: number[];
  signedIn: boolean;
}

export function ProgressColumn({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { t } = useTranslation('feed');
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [pass, setPass] = useState<BattlePassPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [pRes, bRes] = await Promise.all([
      fetch('/api/progress', { credentials: 'include' }),
      fetch('/api/battlepass', { credentials: 'include' }),
    ]);
    if (pRes.ok) setData(await pRes.json());
    if (bRes.ok) setPass(await bRes.json());
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await load();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  async function claimQuest(id: string) {
    setBusy(`q:${id}`);
    try {
      const res = await fetch(`/api/quests/${encodeURIComponent(id)}/claim`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  async function claimTier(tier: number, track: 'free' | 'paid') {
    setBusy(`t:${tier}:${track}`);
    try {
      const res = await fetch('/api/battlepass/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, track }),
      });
      if (res.ok) await load();
    } finally {
      setBusy(null);
    }
  }

  async function unlockPremium() {
    setBusy('unlock');
    try {
      const res = await fetch('/api/battlepass/unlock', { method: 'POST', credentials: 'include' });
      if (res.ok) await load();
      else {
        const body = await res.json().catch(() => ({}));
        if (body?.error) alert(body.error);
      }
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (!data) {
    return (
      <EmptyState
        description={t('could-not-load-progress', { defaultValue: 'Could not load progress.' })}
      />
    );
  }

  const lvl = data.level;
  const lvlPct = Math.round(Math.min(100, lvl.progress * 100));
  const daily = data.quests.filter((q) => q.period === 'daily');
  const weekly = data.quests.filter((q) => q.period === 'weekly');

  return (
    <div className={hideHeader ? '' : 'min-h-screen'}>
      {/* hideHeader === embedded in JourneyColumn, which supplies the page
          header (and the drawer button) itself. */}
      {!hideHeader && (
        <ColumnHeader icon={Zap} title={t('progress-heading', { defaultValue: 'Progress' })} />
      )}

      <div className="space-y-8 p-4">
        {/* Level card */}
        <section className="rounded-site border border-site-border bg-site-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-site bg-site-accent/15 text-site-accent">
                <span className="text-lg font-extrabold">{lvl.level}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-site-text">
                  {t('level-number', { level: lvl.level, defaultValue: 'Level {{level}}' })}
                </p>
                <p className="text-xs text-site-text-muted">
                  {t('total-xp', { xp: lvl.xp.toLocaleString(), defaultValue: '{{xp}} total XP' })}
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-site-sm bg-site-bg px-2.5 py-1.5 text-sm font-semibold text-site-text">
              <CoinIcon className="h-4 w-4" />
              {data.coins.toLocaleString()}
            </div>
          </div>
          <div className="mt-3">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-site-bg">
              <div
                className="h-full rounded-full bg-site-accent transition-[width] duration-300"
                style={{ width: `${lvlPct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-site-text-dim">
              {t('xp-to-next-level', {
                xpIntoLevel: lvl.xpIntoLevel.toLocaleString(),
                xpForNextLevel: lvl.xpForNextLevel.toLocaleString(),
                nextLevel: lvl.level + 1,
                defaultValue: '{{xpIntoLevel}} / {{xpForNextLevel}} XP to level {{nextLevel}}',
              })}
            </p>
          </div>
        </section>

        {/* Daily wheel */}
        <DailyWheel />

        {/* Coin vault (staking) */}
        <StakingCard />

        {/* Quests */}
        <QuestSection
          title={t('daily-quests', { defaultValue: 'Daily quests' })}
          icon={CalendarDays}
          quests={daily}
          busy={busy}
          onClaim={claimQuest}
        />
        <QuestSection
          title={t('weekly-quests', { defaultValue: 'Weekly quests' })}
          icon={CalendarRange}
          quests={weekly}
          busy={busy}
          onClaim={claimQuest}
        />

        {/* Battle pass */}
        {pass && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-site-accent" />
                <h2 className="text-sm font-bold text-site-text">{pass.season.name}</h2>
              </div>
              {pass.premium ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-site-warning/15 px-2.5 py-1 text-[11px] font-semibold text-site-warning">
                  <Crown className="h-3.5 w-3.5" />{' '}
                  {t('premium-unlocked', { defaultValue: 'Premium unlocked' })}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="accent"
                  disabled={busy === 'unlock'}
                  onClick={unlockPremium}
                  className="gap-1.5"
                >
                  {busy === 'unlock' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Crown className="h-3.5 w-3.5" />
                  )}
                  {t('unlock-premium', { defaultValue: 'Unlock premium' })}
                  <span className="inline-flex items-center gap-0.5">
                    <CoinIcon className="h-3.5 w-3.5" />
                    {pass.season.premiumPrice.toLocaleString()}
                  </span>
                </Button>
              )}
            </div>
            <p className="mb-3 text-xs text-site-text-muted">
              {t('tier-progress', {
                currentTier: pass.currentTier,
                totalTiers: pass.tiers.length,
                seasonXp: pass.seasonXp.toLocaleString(),
                defaultValue: 'Tier {{currentTier}} / {{totalTiers}} · {{seasonXp}} season XP',
              })}
            </p>

            <div className="space-y-2">
              {pass.tiers.map((t) => (
                <TierRow
                  key={t.tier}
                  tier={t}
                  reached={pass.currentTier >= t.tier}
                  premiumUnlocked={pass.premium}
                  claimedFree={pass.claimedFree.includes(t.tier)}
                  claimedPaid={pass.claimedPaid.includes(t.tier)}
                  busy={busy}
                  onClaim={claimTier}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function QuestSection({
  title,
  icon: Icon,
  quests,
  busy,
  onClaim,
}: {
  title: string;
  icon: typeof Target;
  quests: QuestView[];
  busy: string | null;
  onClaim: (id: string) => void;
}) {
  const { t } = useTranslation('feed');
  if (quests.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
        <Icon className="h-3.5 w-3.5" /> {title}
      </h2>
      <div className="space-y-2">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <div
              key={q.id}
              className="flex items-start gap-3 rounded-site border border-site-border bg-site-surface p-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm bg-site-accent/12 text-site-accent">
                <Target className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-site-text">{q.name}</p>
                <p className="mt-0.5 text-xs text-site-text-muted">{q.description}</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-site-bg">
                  <div
                    className="h-full rounded-full bg-site-accent"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-site-text-dim">
                  <span>
                    {Math.min(q.progress, q.target)} / {q.target}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Zap className="h-3 w-3 text-site-accent" /> {q.xp}
                  </span>
                  {q.coins > 0 && (
                    <span className="inline-flex items-center gap-0.5">
                      <CoinIcon className="h-3 w-3" /> {q.coins}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 self-center">
                {q.claimed ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-site-text-dim">
                    <Check className="h-3.5 w-3.5" /> {t('claimed', { defaultValue: 'Claimed' })}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={q.completed ? 'accent' : 'outline'}
                    disabled={!q.completed || busy === `q:${q.id}`}
                    onClick={() => onClaim(q.id)}
                    className="gap-1"
                  >
                    {busy === `q:${q.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Gift className="h-3.5 w-3.5" />
                    )}
                    {t('claim', { defaultValue: 'Claim' })}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RewardChip({ reward }: { reward: PassReward | null }) {
  if (!reward) {
    return <span className="text-xs text-site-text-dim">—</span>;
  }
  const Icon = reward.type === 'coins' ? CoinIcon : reward.type === 'xp' ? Zap : Sparkles;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-site-text">
      <Icon className="h-3.5 w-3.5 text-site-accent" />
      {reward.label}
    </span>
  );
}

function TierRow({
  tier,
  reached,
  premiumUnlocked,
  claimedFree,
  claimedPaid,
  busy,
  onClaim,
}: {
  tier: PassTier;
  reached: boolean;
  premiumUnlocked: boolean;
  claimedFree: boolean;
  claimedPaid: boolean;
  busy: string | null;
  onClaim: (tier: number, track: 'free' | 'paid') => void;
}) {
  const { t } = useTranslation('feed');
  return (
    <div
      className={`grid grid-cols-[auto_1fr_1fr] items-center gap-3 rounded-site border p-3 ${
        reached
          ? 'border-site-border bg-site-surface'
          : 'border-site-border/60 bg-site-bg opacity-70'
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm text-sm font-bold ${
          reached ? 'bg-site-accent/15 text-site-accent' : 'bg-site-surface text-site-text-dim'
        }`}
      >
        {tier.tier}
      </div>

      {/* Free track */}
      <TierCell
        label={t('free-track', { defaultValue: 'Free' })}
        reward={tier.free}
        reached={reached}
        claimed={claimedFree}
        locked={false}
        busyKey={`t:${tier.tier}:free`}
        busy={busy}
        onClaim={() => onClaim(tier.tier, 'free')}
      />

      {/* Premium track */}
      <TierCell
        label={t('premium-track', { defaultValue: 'Premium' })}
        reward={tier.premium}
        reached={reached}
        claimed={claimedPaid}
        locked={!premiumUnlocked}
        busyKey={`t:${tier.tier}:paid`}
        busy={busy}
        onClaim={() => onClaim(tier.tier, 'paid')}
        premium
      />
    </div>
  );
}

function TierCell({
  label,
  reward,
  reached,
  claimed,
  locked,
  busyKey,
  busy,
  onClaim,
  premium,
}: {
  label: string;
  reward: PassReward | null;
  reached: boolean;
  claimed: boolean;
  locked: boolean;
  busyKey: string;
  busy: string | null;
  onClaim: () => void;
  premium?: boolean;
}) {
  const { t } = useTranslation('feed');
  const canClaim = reached && !claimed && !locked && !!reward;
  return (
    <div className="min-w-0">
      <p
        className={`mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
          premium ? 'text-site-warning' : 'text-site-text-dim'
        }`}
      >
        {premium && <Crown className="h-3 w-3" />}
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <RewardChip reward={reward} />
        {reward &&
          (claimed ? (
            <Check className="h-4 w-4 shrink-0 text-site-text-dim" />
          ) : locked ? (
            <Lock className="h-4 w-4 shrink-0 text-site-text-dim" />
          ) : canClaim ? (
            <Button
              size="sm"
              variant={premium ? 'accent' : 'outline'}
              disabled={busy === busyKey}
              onClick={onClaim}
              className="h-7 gap-1 px-2 text-xs"
            >
              {busy === busyKey ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Gift className="h-3 w-3" />
              )}
              {t('claim', { defaultValue: 'Claim' })}
            </Button>
          ) : null)}
      </div>
    </div>
  );
}
