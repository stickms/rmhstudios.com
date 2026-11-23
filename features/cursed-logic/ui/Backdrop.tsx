/**
 * The terminal's backdrop: frozen columns of cursed glyphs down both edges and a great sigil circle behind the
 * arena, its ring of logic-gate marks tinted per sector (acid, then shifting to violet and finally danger red at the
 * root). Static art: nothing here moves.
 */
import { useMemo } from 'react';

const GLYPHS = '01#%&/\\<>[]{}=+*§¥∆ΣΞΨ⌬⏚⌁⍜⍉⎔'.split('');
const SECTOR_TINT = ['#b6ff3c', '#b6ff3c', '#c58cff', '#a970ff', '#ff4f6e'];

function column(seed: number, length: number): string[] {
  const out: string[] = [];
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(GLYPHS[s % GLYPHS.length]!);
  }
  return out;
}

export function Backdrop({ sector }: { sector: number }) {
  const tint = SECTOR_TINT[Math.max(0, Math.min(4, sector - 1))]!;
  const cols = useMemo(() => Array.from({ length: 6 }, (_, i) => column(i * 71 + 13, 40)), []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="cl-ground" />
      <svg className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[900px] max-w-none opacity-[0.16]" viewBox="-100 -100 200 200">
        <circle r={92} fill="none" stroke={tint} strokeWidth={0.6} />
        <circle r={84} fill="none" stroke="#a970ff" strokeWidth={0.3} strokeDasharray="2 3" />
        <circle r={52} fill="none" stroke={tint} strokeWidth={0.4} />
        {/* A seven-node logic graph: every node joined to the one three steps on. */}
        <polygon
          points={Array.from({ length: 7 }, (_, i) => {
            const a = ((i * 3) / 7) * Math.PI * 2 - Math.PI / 2;
            return `${Math.cos(a) * 84},${Math.sin(a) * 84}`;
          }).join(' ')}
          fill="none"
          stroke={tint}
          strokeWidth={0.5}
        />
        {Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
          const x = Math.cos(a) * 84;
          const y = Math.sin(a) * 84;
          return (
            <g key={i}>
              <rect x={x - 4} y={y - 4} width={8} height={8} fill="#06040a" stroke={tint} strokeWidth={0.6} transform={`rotate(45 ${x} ${y})`} />
              <text x={x} y={y + 2} fontSize={5} textAnchor="middle" fill={tint} fontFamily="Silkscreen, monospace">
                {['∧', '∨', '¬', '⊕', '→', '↔', '⊥'][i]}
              </text>
            </g>
          );
        })}
        {Array.from({ length: 36 }, (_, i) => {
          const a = (i / 36) * Math.PI * 2;
          return (
            <text
              key={`t${i}`}
              x={Math.cos(a) * 97}
              y={Math.sin(a) * 97}
              fontSize={4}
              textAnchor="middle"
              fill="#a970ff"
              fontFamily="IBM Plex Mono, monospace"
              transform={`rotate(${(i / 36) * 360 + 90} ${Math.cos(a) * 97} ${Math.sin(a) * 97})`}
            >
              {GLYPHS[(i * 7) % GLYPHS.length]}
            </text>
          );
        })}
      </svg>
      {cols.map((c, i) => (
        <div
          key={i}
          className="absolute top-0 font-mono text-[11px] leading-[14px] text-[#b6ff3c] hidden md:flex flex-col"
          style={{
            left: i < 3 ? `${8 + i * 18}px` : undefined,
            right: i >= 3 ? `${8 + (i - 3) * 18}px` : undefined,
            opacity: 0.1 + (i % 3) * 0.05,
          }}
        >
          {c.map((g, j) => (
            <span key={j} style={{ opacity: 1 - j / 44 }}>
              {g}
            </span>
          ))}
        </div>
      ))}
      <div className="cl-scan" />
    </div>
  );
}
