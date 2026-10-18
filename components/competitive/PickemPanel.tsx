import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PICK_ROLES, type PickRole } from '@/lib/competitive/pickem';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

interface PickemData {
  open: boolean;
  complete: boolean;
  pickerCount: number;
  mine: { role: PickRole; entrantId: string }[];
  leaderboard: { user: { name?: string | null } | null; points: number }[];
}

const SLOTS: { key: string; role: PickRole }[] = [
  { key: 'CHAMPION', role: 'CHAMPION' },
  { key: 'FINALIST', role: 'FINALIST' },
  { key: 'SEMI-0', role: 'SEMI' },
  { key: 'SEMI-1', role: 'SEMI' },
];

/** Bracket pick'em card for a single-elimination tournament (no stakes). */
export function PickemPanel({
  tournament,
  signedIn,
}: {
  tournament: SerializedTournament;
  signedIn: boolean;
}) {
  const { t } = useTranslation('f-competitive');
  const [data, setData] = useState<PickemData | null>(null);
  const [card, setCard] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const id = tournament.id;

  const load = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${id}/pickem`);
    if (!res.ok) return;
    const d = (await res.json()) as PickemData;
    setData(d);
    const next: Record<string, string> = {};
    let semi = 0;
    for (const p of d.mine) next[p.role === 'SEMI' ? `SEMI-${semi++}` : p.role] = p.entrantId;
    setCard(next);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, tournament.status]);

  if (!data) return null;
  const entrants = tournament.entrants ?? [];
  const nameOf = (eid: string) => entrants.find((e) => e.id === eid)?.user?.name ?? '?';

  const save = async () => {
    setBusy(true);
    try {
      const picks = SLOTS.filter((s) => card[s.key]).map((s) => ({
        role: s.role,
        entrantId: card[s.key],
      }));
      const res = await fetch(`/api/tournaments/${id}/pickem`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picks }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok)
        toast.error(body.error ?? t('pk-failed', { defaultValue: 'Could not save picks' }));
      else {
        toast.success(t('pk-saved', { defaultValue: 'Picks saved' }));
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const label = (role: PickRole, key: string) =>
    role === 'CHAMPION'
      ? t('pk-champion', { defaultValue: 'Champion' })
      : role === 'FINALIST'
        ? t('pk-finalist', { defaultValue: 'Finalist' })
        : t('pk-semi', { defaultValue: 'Semifinalist' }) + (key.endsWith('1') ? ' 2' : ' 1');

  return (
    <div>
      <h2 className="site-section-label mb-2">{t('pk-title', { defaultValue: 'Pick’em' })}</h2>
      <div className="glass-fill rounded-site p-4 space-y-3">
        <p className="text-sm text-site-text-dim">
          {t('pk-blurb', {
            defaultValue:
              'Predict how this bracket ends before it starts. Champion 8 pts, finalist 4, each semifinalist 2. No coins at stake.',
          })}
          {' · '}
          {t('pk-pickers', { defaultValue: '{{n}} picking', n: data.pickerCount })}
        </p>
        {data.open && signedIn ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {SLOTS.map((s) => (
                <label key={s.key} className="space-y-1 text-sm">
                  <span className="text-xs text-site-text-dim">
                    {label(s.role, s.key)} · {PICK_ROLES[s.role].points}
                  </span>
                  <Select
                    value={card[s.key] ?? ''}
                    onChange={(e) => setCard((c) => ({ ...c, [s.key]: e.target.value }))}
                  >
                    <option value="">{t('pk-none', { defaultValue: '— none —' })}</option>
                    {entrants.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.user?.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            <Button size="sm" onClick={save} loading={busy}>
              {t('pk-save', { defaultValue: 'Save picks' })}
            </Button>
          </>
        ) : (
          data.mine.length > 0 && (
            <ul className="text-sm space-y-1">
              {data.mine.map((p, i) => (
                <li key={i}>
                  <span className="text-site-text-dim">{label(p.role, String(i))}: </span>
                  {nameOf(p.entrantId)}
                </li>
              ))}
            </ul>
          )
        )}
        {data.complete && data.leaderboard.length > 0 && (
          <ol className="text-sm space-y-1 border-t border-site-border pt-3">
            {data.leaderboard.map((r, i) => (
              <li key={i} className="flex justify-between">
                <span>
                  {i + 1}. {r.user?.name ?? '?'}
                </span>
                <span className="font-medium">{r.points}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
