'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EFFICIENCY_GAME_ID, exponentOf } from '@/lib/temple-of-joy/efficiency';
import { TempleButton, TempleSection } from './ui';

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

  const load = useCallback(async () => {
    const [board, me] = await Promise.all([
      fetch(`/api/games/${EFFICIENCY_GAME_ID}/leaderboard?limit=10`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/temple-of-joy/efficiency')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    setRows((board as { entries: Row[] } | null)?.entries ?? []);
    setMine((me as { efficiency: { score: number } | null } | null)?.efficiency?.score ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    const res = await fetch('/api/temple-of-joy/efficiency', { method: 'POST' });
    setNote(
      res.ok
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
        <p className="toj-panel-note">
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
        <p key={`${r.rank}-${r.userId ?? r.username}`} className="toj-panel-note">
          {r.rank}. {r.username} - 10^{exponentOf(r.score)}/h
        </p>
      ))}
    </>
  );
}
