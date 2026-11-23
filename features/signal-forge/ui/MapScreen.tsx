/**
 * The act map as a circuit board: every node is a chip soldered onto copper traces, the route you took is lit
 * amber, the chips you can reach next are ringed in cyan, and the act boss is the big processor at the top.
 */
import { useTranslation } from 'react-i18next';
import { useContentText } from './useContentText';
import { label } from '@features/signal-forge/engine/labels';
import { MAP } from '@features/signal-forge/engine/balance';
import { reachableLanes } from '@features/signal-forge/engine/run';
import type { Action } from '@features/signal-forge/engine/run';
import type { NodeKind, RunState } from '@features/signal-forge/engine/types';
import { Icon, type IconName } from './art/glyphs';

const KIND_ICON: Record<NodeKind, IconName> = {
  combat: 'combat',
  elite: 'elite',
  event: 'event',
  shop: 'shop',
  rest: 'coolant',
  boss: 'boss',
  treasure: 'chest',
};

const KIND_COLOR: Record<NodeKind, string> = {
  combat: '#F6E7D2',
  elite: '#FF8A2A',
  event: '#A6E86A',
  shop: '#FFD27A',
  rest: '#46D8F2',
  boss: '#FF4D3D',
  treasure: '#FFD27A',
};


export function MapScreen({ run, act }: { run: RunState; act: (a: Action) => void }) {
  const { t } = useTranslation('c-signal-forge');
  const lbl = useContentText();
  const reach = new Set(reachableLanes(run));
  const rows = run.map.length;
  // Board coordinates: x by lane, y from the bottom (row 0) up to the boss.
  const W = 300;
  const H = 560;
  const xOf = (lane: number) => 50 + lane * 100;
  const yOf = (row: number) => H - 40 - row * ((H - 80) / (rows - 1));
  const kindLabel = (k: NodeKind) =>
    ({
      combat: t('node.combat', { defaultValue: 'Fight' }),
      elite: t('node.elite', { defaultValue: 'Elite' }),
      event: t('node.event', { defaultValue: 'Event' }),
      shop: t('node.shop', { defaultValue: 'Shop' }),
      rest: t('node.rest-short', { defaultValue: 'Rest' }),
      boss: t('node.boss', { defaultValue: 'Act boss' }),
      treasure: t('node.treasure', { defaultValue: 'Cache' }),
    })[k];

  return (
    <div className="sf-map">
      <div className="sf-map-head">
        <span className="sf-label">{t('hud.act', { defaultValue: 'Act {{n}}', n: run.act })}</span>
        <h2 className="sf-title">{lbl(`act.${run.act}`, label(`act.${run.act}`))}</h2>
        <p className="sf-muted">{t('map.pick', { defaultValue: 'Pick the next chip along a trace.' })}</p>
      </div>
      <div className="sf-board" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" aria-hidden className="sf-board-svg">
          <rect x={4} y={4} width={W - 8} height={H - 8} rx={6} fill="#0F1A14" stroke="#2E4A36" strokeWidth={2} />
          {Array.from({ length: 14 }, (_, i) => (
            <circle key={i} cx={14 + (i % 2) * (W - 28)} cy={20 + Math.floor(i / 2) * 80} r={3} fill="#2E4A36" />
          ))}
          {run.map.slice(0, rows - 1).flatMap((row, r) =>
            row.flatMap((n) => {
              const targets = r + 1 === rows - 1 ? [1] : n.next;
              return targets.map((l) => {
                const lit = r < run.row && run.map[r + 1] && ((r + 1 === rows - 1 ? 1 : l) === laneAt(run, r + 1)) && n.lane === laneAt(run, r);
                const x1 = xOf(n.lane);
                const y1 = yOf(r);
                const x2 = xOf(l);
                const y2 = yOf(r + 1);
                const midY = (y1 + y2) / 2;
                return (
                  <path
                    key={`${r}-${n.lane}-${l}`}
                    d={`M${x1} ${y1} V${midY + 8} L${x2} ${midY - 8} V${y2}`}
                    fill="none"
                    stroke={lit ? '#FF8A2A' : '#B8743A'}
                    strokeOpacity={lit ? 1 : 0.45}
                    strokeWidth={lit ? 4 : 2.5}
                    strokeLinejoin="round"
                  />
                );
              });
            }),
          )}
        </svg>
        {run.map.map((row, r) =>
          row.map((n) => {
            const isBoss = n.kind === 'boss';
            const lane = isBoss ? 1 : n.lane;
            const can = run.row + 1 === r && reach.has(lane);
            const visited = r <= run.row && laneAt(run, r) === lane;
            const past = r <= run.row;
            return (
              <button
                key={`${r}-${n.lane}`}
                type="button"
                className={`sf-chip sf-chip-${n.kind}${can ? ' is-reachable' : ''}${visited ? ' is-visited' : ''}${past && !visited ? ' is-past' : ''}`}
                style={{ left: `${(xOf(lane) / W) * 100}%`, top: `${(yOf(r) / H) * 100}%`, ['--sf-chip' as string]: KIND_COLOR[n.kind] }}
                disabled={!can}
                onClick={() => act({ t: 'node', lane })}
                aria-label={`${kindLabel(n.kind)}${can ? '' : visited ? ` (${t('map.visited', { defaultValue: 'visited' })})` : ''}`}
              >
                <Icon name={KIND_ICON[n.kind]} size={isBoss ? 28 : 18} color={KIND_COLOR[n.kind]} />
                <span className="sf-chip-label">{kindLabel(n.kind)}</span>
              </button>
            );
          }),
        )}
      </div>
      <p className="sf-map-legend sf-muted">
        {MAP.rows} {t('map.rows', { defaultValue: 'rows, then the boss' })}
      </p>
    </div>
  );
}

/** The lane the player took on a row (rows above the current one have none). */
function laneAt(run: RunState, row: number): number | undefined {
  if (row > run.row) return undefined;
  if (row === run.row) return run.lane;
  // Earlier rows: reconstructed from the trail kept on the run.
  return run.trail?.[row];
}
