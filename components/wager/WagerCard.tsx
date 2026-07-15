'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Swords, Coins, ShieldCheck, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { SerializedWager } from '@/lib/wager/wager.server';

interface Props {
  wager: SerializedWager;
  viewerId: string | null;
  onChange: (wager: SerializedWager | null) => void;
}

export function WagerCard({ wager, viewerId, onChange }: Props) {
  const { t } = useTranslation('c-wager');
  const [busy, setBusy] = useState(false);

  const isChallenger = viewerId != null && wager.challenger?.id === viewerId;
  const isOpponent = viewerId != null && wager.opponent?.id === viewerId;
  const isParticipant = isChallenger || isOpponent;

  const call = async (path: string, body?: unknown): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? t('action-failed', { defaultValue: 'Something went wrong' }));
        return null;
      }
      return data;
    } catch {
      toast.error(t('action-failed', { defaultValue: 'Something went wrong' }));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    const data = await call(`/api/wager/${wager.id}/accept`);
    if (data?.wager) {
      toast.success(t('accepted', { defaultValue: 'Challenge accepted — play now!' }));
      onChange(data.wager as SerializedWager);
    }
  };

  const cancel = async () => {
    const data = await call(`/api/wager/${wager.id}/cancel`);
    if (data) {
      toast.success(t('cancelled', { defaultValue: 'Challenge cancelled and stake refunded' }));
      onChange(null);
    }
  };

  const report = async (winnerId: string) => {
    const data = await call(`/api/wager/${wager.id}/report`, { winnerId });
    if (data) {
      const status = data.status as string;
      if (status === 'settled') toast.success(t('settled', { defaultValue: 'Result confirmed — pot paid out!' }));
      else if (status === 'disputed') toast.warning(t('disputed', { defaultValue: 'Reports disagree — sent to an admin' }));
      else toast.success(t('reported', { defaultValue: 'Result reported — waiting on your opponent' }));
      onChange({ ...wager, viewerReported: true });
    }
  };

  const statusBadge = () => {
    switch (wager.status) {
      case 'OPEN':
        return <Badge variant="outline">{t('status-open', { defaultValue: 'Open' })}</Badge>;
      case 'ACCEPTED':
      case 'LIVE':
        return <Badge variant="accent">{t('status-live', { defaultValue: 'In progress' })}</Badge>;
      case 'DISPUTED':
        return <Badge variant="danger">{t('status-disputed', { defaultValue: 'Disputed' })}</Badge>;
      case 'SETTLED':
        return <Badge variant="success">{t('status-settled', { defaultValue: 'Settled' })}</Badge>;
      default:
        return <Badge variant="outline">{wager.status}</Badge>;
    }
  };

  return (
    <Card className="p-4 space-y-3" interactive>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Swords className="size-4 shrink-0 text-site-accent" />
          <Link to="/wager/$id" params={{ id: wager.id }} className="font-semibold truncate hover:underline">
            {wager.gameTitle ?? wager.gameId}
          </Link>
          {wager.authoritative && (
            <span title={t('authoritative', { defaultValue: 'Server-verified result' })}>
              <ShieldCheck className="size-4 text-site-success" />
            </span>
          )}
        </div>
        {statusBadge()}
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <UserAvatar src={wager.challenger?.image ?? null} alt={wager.challenger?.name ?? ''} size={24} fallbackName={wager.challenger?.name ?? '?'} />
          <span className="truncate">{wager.challenger?.name ?? t('someone', { defaultValue: 'Someone' })}</span>
        </div>
        <span className="text-site-text-dim px-2">{t('vs', { defaultValue: 'vs' })}</span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          {wager.opponent ? (
            <>
              <span className="truncate">{wager.opponent.name}</span>
              <UserAvatar src={wager.opponent.image ?? null} alt={wager.opponent.name ?? ''} size={24} fallbackName={wager.opponent.name ?? '?'} />
            </>
          ) : (
            <span className="text-site-text-dim italic">{t('open-seat', { defaultValue: 'Open seat' })}</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5 text-site-text-dim">
          <Coins className="size-4 text-yellow-500" />
          <span>
            {t('pot', { defaultValue: '{{pot}} coin pot', pot: wager.potCoins || wager.stakeCoins * 2 })}
            {' · '}
            {t('stake-each', { defaultValue: '{{stake}} each', stake: wager.stakeCoins })}
          </span>
        </div>
        {wager.status === 'SETTLED' && wager.winnerId && (
          <div className="flex items-center gap-1 text-site-success font-medium">
            <Trophy className="size-4" />
            {wager.winnerId === wager.challenger?.id ? wager.challenger?.name : wager.opponent?.name}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        {wager.status === 'OPEN' && !isChallenger && viewerId && (
          <Button size="sm" onClick={accept} loading={busy}>
            {t('accept', { defaultValue: 'Accept' })} · {wager.stakeCoins} 🪙
          </Button>
        )}
        {wager.status === 'OPEN' && isChallenger && (
          <Button size="sm" variant="outline" onClick={cancel} loading={busy}>
            {t('cancel-refund', { defaultValue: 'Cancel & refund' })}
          </Button>
        )}
        {(wager.status === 'ACCEPTED' || wager.status === 'LIVE') && isParticipant && (
          <>
            {wager.gameHref && (
              <Button size="sm" variant="secondary" asChild>
                <a href={wager.gameHref}>{t('play', { defaultValue: 'Play' })}</a>
              </Button>
            )}
            {!wager.viewerReported && (
              <>
                <span className="text-xs text-site-text-dim self-center">
                  {t('who-won', { defaultValue: 'Who won?' })}
                </span>
                <Button size="sm" variant="outline" onClick={() => report(wager.challenger!.id)} loading={busy}>
                  {wager.challenger?.name}
                </Button>
                <Button size="sm" variant="outline" onClick={() => report(wager.opponent!.id)} loading={busy}>
                  {wager.opponent?.name}
                </Button>
              </>
            )}
            {wager.viewerReported && (
              <span className="text-xs text-site-text-dim self-center">
                {t('awaiting-opponent', { defaultValue: 'Waiting on the other player to confirm…' })}
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
