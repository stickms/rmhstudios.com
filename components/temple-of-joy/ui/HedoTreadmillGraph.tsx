"use client";

import { useEffect, useRef, useState } from "react";
import { useTempleStore } from "@/lib/temple-of-joy/store";

const MAX_POINTS = 60;
const SAMPLE_INTERVAL_MS = 1000; // record one data point per second

interface DataPoint {
  happiness: number;
  baseline: number;
}

export default function HedoTreadmillGraph() {
  const happiness = useTempleStore((s) => s.happiness);
  const baselineHappiness = useTempleStore((s) => s.baselineHappiness);

  // Rolling buffer in a ref for mutation, rendered copy in state
  const bufferRef = useRef<DataPoint[]>([]);
  const lastSampleRef = useRef<number>(0);
  const [points, setPoints] = useState<DataPoint[]>([]);

  // Accumulate data points and sync to state for rendering.
  // Intentionally no dep array — runs after every render to check the
  // wall-clock timer without being gated on which values changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const now = performance.now();
    if (now - lastSampleRef.current >= SAMPLE_INTERVAL_MS) {
      lastSampleRef.current = now;
      const next = [
        ...bufferRef.current.slice(-(MAX_POINTS - 1)),
        { happiness, baseline: baselineHappiness },
      ];
      bufferRef.current = next;
      setPoints(next);
    }
  });

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-20 text-temple-muted text-xs italic">
        Gathering data…
      </div>
    );
  }

  // ── SVG dimensions ───────────────────────────────────────────────────────
  const W = 260;
  const H = 72;
  const PAD = { top: 4, right: 4, bottom: 20, left: 4 };
  const gW = W - PAD.left - PAD.right;
  const gH = H - PAD.top - PAD.bottom;

  const allValues = points.flatMap((p) => [p.happiness, p.baseline]);
  const maxVal = Math.max(...allValues, 1);
  const minVal = Math.min(...allValues, 0);
  const range = maxVal - minVal || 1;

  const toX = (i: number) => PAD.left + (i / (MAX_POINTS - 1)) * gW;
  const toY = (v: number) => PAD.top + gH - ((v - minVal) / range) * gH;

  // Pad left with the oldest known point so lines always span full width
  const padded: DataPoint[] = [
    ...Array(MAX_POINTS - points.length).fill(points[0]),
    ...points,
  ];

  const happPath = padded
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.happiness).toFixed(1)}`)
    .join(" ");

  const basePath = padded
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.baseline).toFixed(1)}`)
    .join(" ");

  // Shaded area between curves
  const areaPath = [
    ...padded.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.happiness).toFixed(1)}`),
    ...[...padded].reverse().map((p, i, arr) =>
      `${i === 0 ? "L" : "L"}${toX(arr.length - 1 - i).toFixed(1)},${toY(p.baseline).toFixed(1)}`
    ),
    "Z",
  ].join(" ");

  return (
    <div className="w-full select-none">
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1 text-temple-muted">
        Hedonic Treadmill
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        aria-label="Happiness vs baseline over time"
        className="overflow-visible"
        style={{ maxHeight: 96 }}
      >
        {/* Grid lines */}
        <line
          x1={PAD.left}
          y1={PAD.top + gH}
          x2={PAD.left + gW}
          y2={PAD.top + gH}
          stroke="var(--temple-border)"
          strokeWidth="0.5"
          strokeDasharray="3,3"
        />
        <line
          x1={PAD.left}
          y1={PAD.top + gH / 2}
          x2={PAD.left + gW}
          y2={PAD.top + gH / 2}
          stroke="var(--temple-border)"
          strokeWidth="0.5"
          strokeDasharray="2,4"
          strokeOpacity="0.5"
        />

        {/* Shaded gap area */}
        <path
          d={areaPath}
          fill="var(--temple-accent)"
          fillOpacity="0.08"
        />

        {/* Baseline line */}
        <path
          d={basePath}
          fill="none"
          stroke="var(--temple-accent)"
          strokeWidth="1"
          strokeDasharray="4,3"
          strokeOpacity="0.6"
        />

        {/* Happiness line */}
        <path
          d={happPath}
          fill="none"
          stroke="var(--temple-accent-bright)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Axis labels */}
        <text
          x={PAD.left}
          y={H - 5}
          fontSize="8"
          fill="var(--temple-text-muted)"
          opacity="0.7"
        >
          60s ago
        </text>
        <text
          x={PAD.left + gW}
          y={H - 5}
          fontSize="8"
          textAnchor="end"
          fill="var(--temple-text-muted)"
          opacity="0.7"
        >
          now
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-0.5">
        <span className="flex items-center gap-1 text-[9px] text-temple-muted">
          <svg width="16" height="4">
            <line x1="0" y1="2" x2="16" y2="2" stroke="var(--temple-accent-bright)" strokeWidth="1.5" />
          </svg>
          Happiness
        </span>
        <span className="flex items-center gap-1 text-[9px] text-temple-muted">
          <svg width="16" height="4">
            <line
              x1="0" y1="2" x2="16" y2="2"
              stroke="var(--temple-accent)"
              strokeWidth="1"
              strokeDasharray="4,3"
              opacity="0.7"
            />
          </svg>
          Baseline
        </span>
      </div>
    </div>
  );
}
