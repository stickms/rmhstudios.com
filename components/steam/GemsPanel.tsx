'use client';

import { useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Gem } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BUY_UNIT_GEMS, MAX_BUY_UNITS, PACK_COST, PACK_SIZE, coinCostFor } from '@/lib/cards/gems';
import { gemsErrorText } from './gems-errors';

async function post<T = unknown>(path: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: T }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error };
  } catch {
    return { ok: false };
  }
}

/** Gems: your balance, buying more with coins, and opening a booster pack for a title. */
export function GemsPanel({
  gems,
  coins,
  packTitles,
}: {
  gems: number;
  coins: number;
  packTitles: { id: string; title: string }[];
}) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [units, setUnits] = useState(1);
  const [title, setTitle] = useState(packTitles[0]?.id ?? '');
  const [busy, setBusy] = useState<'buy' | 'pack' | null>(null);

  async function buy() {
    setBusy('buy');
    const r = await post('/api/games/gems/buy', { units });
    setBusy(null);
    if (r.ok) {
      toast.success(t('steam-gems-bought', { defaultValue: 'Bought {{n}} gems.', n: units * BUY_UNIT_GEMS }));
      await router.invalidate();
    } else toast.error(gemsErrorText(r.error, t));
  }

  async function open() {
    setBusy('pack');
    const r = await post<{ cards: { name: string; foil: boolean }[] }>('/api/games/gems/pack', { gameId: title });
    setBusy(null);
    if (r.ok && r.data) {
      const names = r.data.cards
        .map((c) => (c.foil ? `${c.name} (${t('steam-market-foil', { defaultValue: 'foil' })})` : c.name))
        .join(', ');
      toast.success(t('steam-gems-opened', { defaultValue: 'Booster pack: {{cards}}', cards: names }));
      await router.invalidate();
    } else toast.error(gemsErrorText(r.error, t));
  }

  return (
    <section className="stm-web-card" aria-labelledby="stm-gems-h">
      <h2 id="stm-gems-h" className="stm-web-head">
        {t('steam-gems', { defaultValue: 'Gems' })}
        <span className="stm-count stm-balance">
          <Gem aria-hidden size={14} />
          {gems}
        </span>
      </h2>
      <div className="stm-gems-grid">
        <div className="stm-gems-box">
          <h3 className="stm-subhead">{t('steam-gems-buy', { defaultValue: 'Buy gems' })}</h3>
          <p className="stm-muted">
            {t('steam-gems-buy-note', {
              defaultValue: 'One coin per gem. You have {{n}} coins.',
              n: coins,
            })}
          </p>
          <label className="stm-gems-row">
            <span className="stm-sr">{t('steam-gems-units', { defaultValue: 'Hundreds of gems' })}</span>
            <select className="stm-input" value={units} onChange={(e) => setUnits(Number(e.target.value))}>
              {Array.from({ length: MAX_BUY_UNITS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {t('steam-gems-option', { defaultValue: '{{gems}} gems for {{coins}} coins', gems: n * BUY_UNIT_GEMS, coins: coinCostFor(n) })}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="stm-btn stm-btn-blue" disabled={busy !== null || coins < coinCostFor(units)} onClick={() => void buy()}>
            {t('steam-market-buy', { defaultValue: 'Buy' })}
          </button>
        </div>
        <div className="stm-gems-box">
          <h3 className="stm-subhead">{t('steam-gems-pack', { defaultValue: 'Booster pack' })}</h3>
          <p className="stm-muted">
            {t('steam-gems-pack-note', {
              defaultValue: '{{cost}} gems for {{n}} cards of a title you choose.',
              cost: PACK_COST,
              n: PACK_SIZE,
            })}
          </p>
          <label className="stm-gems-row">
            <span className="stm-sr">{t('steam-gems-title', { defaultValue: 'Title' })}</span>
            <select className="stm-input" value={title} onChange={(e) => setTitle(e.target.value)}>
              {packTitles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="stm-btn stm-btn-blue" disabled={busy !== null || gems < PACK_COST || !title} onClick={() => void open()}>
            {t('steam-gems-open', { defaultValue: 'Open pack' })}
          </button>
        </div>
      </div>
    </section>
  );
}
