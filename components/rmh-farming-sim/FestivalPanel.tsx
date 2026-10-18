'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { actions } from '@/lib/rmh-farming-sim/socket';
import { useRfsStore } from '@/lib/rmh-farming-sim/store';
import { festivalById, festivalIdFromKey } from '@/lib/rmh-farming-sim/festivals';

interface FestivalInfo {
  active: { key: string; id: string; name: string } | null;
  next: { id: string; name: string; daysAway: number };
  board: { key: string; name: string; live: boolean; top: { name: string; score: number }[] };
}

// One fetch per page load, shared by the banner and the shop section.
let inflight: Promise<FestivalInfo | null> | null = null;
function loadFestival(): Promise<FestivalInfo | null> {
  inflight ??= fetch('/api/worlds/festival')
    .then((r) => (r.ok ? (r.json() as Promise<FestivalInfo>) : null))
    .catch(() => null);
  return inflight;
}

function useFestival() {
  const [info, setInfo] = useState<FestivalInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void loadFestival().then((v) => alive && setInfo(v));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

const BANNER_STYLE = { position: 'absolute', top: 66, left: 10, pointerEvents: 'none' } as const;

/** R8: today's festival and contest score, or a countdown to the next one. */
export function FestivalBanner() {
  const { t } = useTranslation('f-worlds');
  const fest = useRfsStore((s) => s.stats?.festival);
  const info = useFestival();
  const def = fest ? festivalById(festivalIdFromKey(fest.key)) : undefined;

  if (def && fest) {
    return (
      <div data-floating="feature-overlay" className="rfs-stat" style={BANNER_STYLE}>
        {t('fest-banner', {
          defaultValue: '{{name}} - festival harvest today: {{score}}g',
          name: def.name,
          score: fest.score,
        })}
      </div>
    );
  }
  if (!info) return null;
  return (
    <div
      data-floating="feature-overlay"
      className="rfs-stat"
      style={{ ...BANNER_STYLE, opacity: 0.8 }}
    >
      {t('fest-next', {
        defaultValue: 'Next festival: {{name}} in {{count}} days',
        name: info.next.name,
        count: info.next.daysAway,
      })}
    </div>
  );
}

/** R8: the one-day festival stall and the contest board, at the top of the shop. */
export function FestivalShop() {
  const { t } = useTranslation('f-worlds');
  const fest = useRfsStore((s) => s.stats?.festival);
  const money = useRfsStore((s) => s.stats?.money ?? 0);
  const info = useFestival();
  const def = fest ? festivalById(festivalIdFromKey(fest.key)) : undefined;
  const board = info?.board;

  if (!def && !(board && board.top.length > 0)) return null;

  return (
    <div className="rfs-list" style={{ marginBottom: 12 }}>
      {def && fest && (
        <>
          <div className="rfs-row-name">
            {t('fest-shop', { defaultValue: '{{name}} stall (today only)', name: def.name })}
          </div>
          {def.items.map((item) => {
            const bought = fest.bought.includes(item.id);
            return (
              <div className="rfs-row" key={item.id}>
                <div className="rfs-row-main">
                  <div className="rfs-row-name">{item.name}</div>
                  <div className="rfs-row-sub">
                    {Object.entries(item.seeds)
                      .map(([crop, n]) => `${n} ${crop}`)
                      .join(', ')}
                  </div>
                </div>
                <div className="rfs-row-actions">
                  <span className="rfs-price">{item.cost}g</span>
                  <button
                    className="rfs-mini"
                    disabled={bought || money < item.cost}
                    onClick={() => actions.buyFestival(item.id)}
                  >
                    {bought
                      ? t('fest-bought', { defaultValue: 'Bought' })
                      : t('fest-buy', { defaultValue: 'Buy' })}
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
      {board && board.top.length > 0 && (
        <>
          <div className="rfs-row-name">
            {board.live
              ? t('fest-board-live', {
                  defaultValue: '{{name}} contest - biggest harvest today',
                  name: board.name,
                })
              : t('fest-board', {
                  defaultValue: '{{name}} contest - final results',
                  name: board.name,
                })}
          </div>
          {board.top.map((row, i) => (
            <div className="rfs-row" key={`${row.name}-${i}`}>
              <div className="rfs-row-main">
                <div className="rfs-row-name">
                  {i + 1}. {row.name}
                </div>
              </div>
              <span className="rfs-price">{row.score}g</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
