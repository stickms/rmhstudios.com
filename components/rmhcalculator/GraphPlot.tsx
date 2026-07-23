/**
 * GraphPlot — renders a graph the model computed.
 *
 * IMPORTANT: this component does no mathematics. It only maps the model's data
 * coordinates to pixel coordinates (a linear rendering transform) and draws the
 * points, axes, ticks and gridlines that DeepSeek returned. Series lines break
 * wherever the model marked a point's y as null (asymptotes / domain gaps).
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { GRAPH_SERIES_COLORS, type GraphResult } from '@/lib/rmhcalculator/types';

const W = 660;
const H = 440;
const PAD_L = 52;
const PAD_R = 18;
const PAD_T = 18;
const PAD_B = 34;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/** Trim a value the model returned to a short, readable label. */
function fmt(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e4 || abs < 1e-3) return n.toExponential(1).replace('e+', 'e');
  return String(Math.round(n * 1000) / 1000);
}

export function GraphPlot({ graph }: { graph: GraphResult }) {
  const { t } = useTranslation('c-rmhcalculator');
  const clipId = useId();
  const { xMin, xMax, yMin, yMax } = graph.view;

  // Guard against a degenerate window (rendering-only fallback, not evaluation).
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const sx = (x: number) => PAD_L + ((x - xMin) / xSpan) * PLOT_W;
  const sy = (y: number) => PAD_T + ((yMax - y) / ySpan) * PLOT_H;

  const xTicks = graph.xTicks.filter((x) => x >= xMin && x <= xMax);
  const yTicks = graph.yTicks.filter((y) => y >= yMin && y <= yMax);
  const showYAxis = xMin <= 0 && xMax >= 0;
  const showXAxis = yMin <= 0 && yMax >= 0;

  // Build one SVG path per series, starting a new subpath after every null y so
  // discontinuities are never bridged.
  const paths = graph.series.map((s) => {
    let d = '';
    let penDown = false;
    for (const [x, y] of s.points) {
      if (y === null || !Number.isFinite(y)) {
        penDown = false;
        continue;
      }
      const px = sx(x);
      const py = sy(y);
      d += `${penDown ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)} `;
      penDown = true;
    }
    return d.trim();
  });

  return (
    <figure className="rmhcalc-plot">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="rmhcalc-plot__svg"
        role="img"
        aria-label={t('graph-aria', {
          defaultValue: 'Graph of {{fns}}',
          fns: graph.series.map((s) => s.expression).join(', '),
        })}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
          </clipPath>
        </defs>

        {/* Plot background */}
        <rect
          x={PAD_L}
          y={PAD_T}
          width={PLOT_W}
          height={PLOT_H}
          fill="var(--site-bg)"
          stroke="var(--site-border)"
          rx={8}
        />

        {/* Gridlines + tick labels */}
        {xTicks.map((x) => (
          <g key={`x${x}`}>
            <line
              x1={sx(x)}
              y1={PAD_T}
              x2={sx(x)}
              y2={PAD_T + PLOT_H}
              stroke="var(--site-border)"
              strokeOpacity={0.5}
            />
            <text
              x={sx(x)}
              y={PAD_T + PLOT_H + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--site-text-dim)"
            >
              {fmt(x)}
            </text>
          </g>
        ))}
        {yTicks.map((y) => (
          <g key={`y${y}`}>
            <line
              x1={PAD_L}
              y1={sy(y)}
              x2={PAD_L + PLOT_W}
              y2={sy(y)}
              stroke="var(--site-border)"
              strokeOpacity={0.5}
            />
            <text
              x={PAD_L - 8}
              y={sy(y) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--site-text-dim)"
            >
              {fmt(y)}
            </text>
          </g>
        ))}

        {/* Axes (drawn stronger when the origin is in view) */}
        {showXAxis && (
          <line
            x1={PAD_L}
            y1={sy(0)}
            x2={PAD_L + PLOT_W}
            y2={sy(0)}
            stroke="var(--site-text-muted)"
            strokeWidth={1.5}
          />
        )}
        {showYAxis && (
          <line
            x1={sx(0)}
            y1={PAD_T}
            x2={sx(0)}
            y2={PAD_T + PLOT_H}
            stroke="var(--site-text-muted)"
            strokeWidth={1.5}
          />
        )}

        {/* Series */}
        <g clipPath={`url(#${clipId})`}>
          {paths.map((d, i) =>
            d ? (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={GRAPH_SERIES_COLORS[i % GRAPH_SERIES_COLORS.length]}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
        </g>
      </svg>

      {/* Legend */}
      <figcaption className="rmhcalc-plot__legend">
        {graph.series.map((s, i) => (
          <span key={i} className="rmhcalc-plot__legend-item">
            <span
              className="rmhcalc-plot__swatch"
              style={{ background: GRAPH_SERIES_COLORS[i % GRAPH_SERIES_COLORS.length] }}
              aria-hidden="true"
            />
            <span className="rmhcalc-plot__legend-label">{s.expression}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
