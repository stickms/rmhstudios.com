import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { gameName, RANKED_GAMES } from '@/lib/ranked/elo';
import { HANDICAP_HOOKS } from '@/lib/ranked/handicap';

interface Row {
  id: string;
  game: string;
  status: 'pending' | 'accepted';
  incoming: boolean;
  other: { name?: string | null };
  handicap: { kind: string; amount: number; mine: boolean; launchUrl: string | null } | null;
  ratingGap: number;
}

/** Unranked friendly challenges with an optional Elo-gap handicap (never touches ratings). */
export default function FriendlyChallenges() {
  const { t } = useTranslation('f-competitive');
  const [rows, setRows] = useState<Row[]>([]);
  const [game, setGame] = useState('void-breaker');
  const [opponent, setOpponent] = useState('');
  const [handicap, setHandicap] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/friendly');
    if (res.ok) setRows((await res.json()).challenges ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const call = async (url: string, init: RequestInit, ok: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        toast.error(data.error ?? t('fr-failed', { defaultValue: 'Something went wrong' }));
      else {
        toast.success(ok);
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const act = (id: string, body: object) =>
    call(
      `/api/friendly/${id}`,
      { method: 'POST', body: JSON.stringify(body) },
      t('fr-updated', { defaultValue: 'Updated' }),
    );

  return (
    <section className="glass-pane rounded-site p-4 space-y-3" aria-labelledby="friendly-heading">
      <div>
        <h2 id="friendly-heading" className="text-sm font-bold text-site-text">
          {t('fr-title', { defaultValue: 'Friendly challenge' })}
        </h2>
        <p className="text-xs text-site-text-dim">
          {t('fr-blurb', {
            defaultValue:
              'Unranked: no rating changes. Where a game supports it, the lower-rated player gets a head start.',
          })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Select
          value={game}
          onChange={(e) => setGame(e.target.value)}
          aria-label={t('fr-game', { defaultValue: 'Game' })}
        >
          {RANKED_GAMES.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Input
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder={t('fr-opponent', { defaultValue: 'Handle' })}
          aria-label={t('fr-opponent', { defaultValue: 'Handle' })}
          className="max-w-48"
        />
        {HANDICAP_HOOKS[game] && (
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={handicap}
              onChange={(e) => setHandicap(e.target.checked)}
            />
            {t('fr-handicap', { defaultValue: 'Handicap by rating gap' })}
          </label>
        )}
        <Button
          size="sm"
          loading={busy}
          disabled={!opponent.trim()}
          onClick={() =>
            call(
              '/api/friendly',
              {
                method: 'POST',
                body: JSON.stringify({
                  game,
                  opponent: opponent.trim(),
                  handicap: handicap && !!HANDICAP_HOOKS[game],
                }),
              },
              t('fr-sent', { defaultValue: 'Challenge sent' }),
            ).then(() => setOpponent(''))
          }
        >
          {t('fr-send', { defaultValue: 'Send' })}
        </Button>
      </div>
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="glass-fill rounded-site p-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <strong>{gameName(r.game)}</strong> · {r.other.name}
                </span>
                <span className="text-xs text-site-text-dim">
                  {r.status === 'pending'
                    ? t('fr-pending', { defaultValue: 'Pending' })
                    : t('fr-accepted', { defaultValue: 'In play' })}
                </span>
              </div>
              {r.handicap && (
                <p className="text-xs text-site-text-dim">
                  {r.handicap.mine
                    ? t('fr-hp-you', {
                        defaultValue:
                          'Handicap: you start with +{{n}} max HP (rating gap {{gap}}).',
                        n: r.handicap.amount,
                        gap: r.ratingGap,
                      })
                    : t('fr-hp-them', {
                        defaultValue:
                          'Handicap: they start with +{{n}} max HP (rating gap {{gap}}).',
                        n: r.handicap.amount,
                        gap: r.ratingGap,
                      })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {r.status === 'pending' && r.incoming && (
                  <>
                    <Button
                      size="xs"
                      onClick={() => act(r.id, { action: 'accept' })}
                      disabled={busy}
                    >
                      {t('fr-accept', { defaultValue: 'Accept' })}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => act(r.id, { action: 'decline' })}
                      disabled={busy}
                    >
                      {t('fr-decline', { defaultValue: 'Decline' })}
                    </Button>
                  </>
                )}
                {r.status === 'accepted' && (
                  <>
                    {r.handicap?.launchUrl && (
                      <a href={r.handicap.launchUrl}>
                        <Button size="xs">
                          {t('fr-play-hc', { defaultValue: 'Play with handicap' })}
                        </Button>
                      </a>
                    )}
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => act(r.id, { action: 'report', result: 'win' })}
                      disabled={busy}
                    >
                      {t('fr-won', { defaultValue: 'I won' })}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => act(r.id, { action: 'report', result: 'loss' })}
                      disabled={busy}
                    >
                      {t('fr-lost', { defaultValue: 'I lost' })}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
