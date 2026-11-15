import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EFFICIENCY_GAME_ID, exponentOf } from '@/lib/temple-of-joy/efficiency';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { getGameLeaderboardApi } from '@/lib/game/leaderboard.contract';
import {
  getTempleEfficiencyApi,
  rankTempleEfficiencyApi,
} from '@/lib/temple-of-joy/efficiency.contract';
import { TempleButton, TempleSection } from './ui';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

interface Row {
  rank: number;
  username: string;
  score: number;
  userId: string | null;
}

/** R9: gladness-per-real-hour board, so idling well (not just long) ranks. */
export function EfficiencyBoard() {
  const { t } = useTranslation('f-worlds');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mine, setMine] = useState<number | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);
  const signedIn = Boolean(useSession().data?.user);
  const arrival = useArrival(rows !== null);

  const load = useCallback(async () => {
    const [board, me] = await Promise.all([
      api(getGameLeaderboardApi, {
        params: { id: EFFICIENCY_GAME_ID },
        query: { limit: 10 },
      }).catch(() => null),
      // Signed out there is no row to read; asking would only log a 401.
      signedIn ? api(getTempleEfficiencyApi).catch(() => null) : Promise.resolve(null),
    ]);
    setRows(board?.entries ?? []);
    setMine(me?.efficiency?.score ?? null);
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const ok = await api(rankTempleEfficiencyApi).then(
      () => true,
      () => false,
    );
    setNote(
      ok
        ? t('eff-ranked', { defaultValue: 'Ranked.' })
        : t('eff-failed', { defaultValue: 'Could not rank this yet.' }),
    );
    void load();
  }

  return (
    <>
      <TempleSection>{t('eff-title', { defaultValue: 'Efficiency board' })}</TempleSection>
      <p className="toj-panel-note">
        {t('eff-note', {
          defaultValue:
            'Gladness per real hour in the temple, from your saved game (an hour of play to qualify). Idling well beats idling long.',
        })}
      </p>
      {typeof mine === 'number' && (
        <p className={cn('toj-panel-note', arrival)}>
          {t('eff-mine', {
            defaultValue: 'You are making about 10^{{exp}} gladness an hour.',
            exp: exponentOf(mine),
          })}
        </p>
      )}
      {mine != null && (
        <TempleButton onClick={submit}>
          {t('eff-submit', { defaultValue: 'Rank my efficiency' })}
        </TempleButton>
      )}
      {note && <p className="toj-panel-note">{note}</p>}
      {rows?.map((r) => (
        <p key={`${r.rank}-${r.userId ?? r.username}`} className={cn('toj-panel-note', arrival)}>
          {r.rank}. {r.username} - 10^{exponentOf(r.score)}/h
        </p>
      ))}
    </>
  );
}
