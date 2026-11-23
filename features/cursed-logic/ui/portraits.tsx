/**
 * Protocol portraits: one 16x16 pixel mask per opponent, drawn as SVG cells with a violet ghost knocked one pixel
 * left (the terminal's chromatic error) and set inside a containment ring of sigil marks. Original art; each mask is
 * read straight from the strings below, so a face is edited where you can see it.
 *
 * Cell codes: `.` empty · `a` acid · `v` violet · `w` phosphor white · `d` deep violet · `r` danger · `k` void.
 */
import type { ProtocolId } from '@features/cursed-logic/engine/types';

const INK: Record<string, string> = {
  a: '#b6ff3c',
  v: '#a970ff',
  w: '#e8ffd2',
  d: '#3b2a5c',
  r: '#ff4f6e',
  k: '#06040a',
};

export const MASKS: Record<ProtocolId, readonly string[]> = {
  // A gatekeeper's helm: a barred visor.
  warden: [
    '................',
    '.....dddddd.....',
    '...ddaaaaaadd...',
    '..daawwwwwwaad..',
    '..daw......wad..',
    '.daawaaaaaawaad.',
    '.daw.a.aa.a.wad.',
    '.daw.a.aa.a.wad.',
    '.daawaaaaaawaad.',
    '.daw........wad.',
    '..daw.wwww.wad..',
    '..daaw....waad..',
    '...daawwwwaad...',
    '....ddaaaadd....',
    '......dddd......',
    '................',
  ],
  // Two halves that copy each other, in two colours.
  mimic: [
    '................',
    '.....aaavvv.....',
    '...aaaaavvvvv...',
    '..aa........vv..',
    '.aa..........vv.',
    '.a..ww....ww..v.',
    '.a.wkkw..wkkw.v.',
    '.a.wkkw..wkkw.v.',
    '.a..ww....ww..v.',
    '.a............v.',
    '.a..a......v..v.',
    '.aa..aaavvv..vv.',
    '..aa........vv..',
    '...aaaaavvvvv...',
    '.....aaavvv.....',
    '................',
  ],
  // Horns and teeth.
  berserk: [
    '.r............r.',
    '.rr..........rr.',
    '..rr.rrrrrr.rr..',
    '..rrrrrrrrrrrr..',
    '.rr..........rr.',
    '.r..r......r..r.',
    '.r..rrw..wrr..r.',
    '.r...rr..rr...r.',
    '.r............r.',
    '.r.wwwwwwwwww.r.',
    '.r.w.w.ww.w.w.r.',
    '.r.wwwwwwwwww.r.',
    '.rr..........rr.',
    '..rr..rrrr..rr..',
    '...rrrr..rrrr...',
    '................',
  ],
  // Two faces: one smiles, one does not; the tongue forks.
  liar: [
    '................',
    '....aaaavvvv....',
    '..aaa......vvv..',
    '.aa..........vv.',
    '.a............v.',
    '.a..ww...vvvv.v.',
    '.a.wkkw.......v.',
    '.a..ww...vvvv.v.',
    '.a............v.',
    '.a.a........v.v.',
    '.a..aaa..vvv..v.',
    '.a....rrrr....v.',
    '.aa....rr....vv.',
    '..aaa.r..r.vvv..',
    '....aaaavvvv....',
    '................',
  ],
  // A mouth with tendrils.
  leech: [
    '................',
    '....vvvvvvvv....',
    '..vvddddddddvv..',
    '.vvd........dvv.',
    '.vd..aa..aa..dv.',
    '.vd..aa..aa..dv.',
    '.vd..........dv.',
    '.vd...wwwww..dv.',
    '.vd..w.r.r.w.dv.',
    '.vd...wwwww..dv.',
    '.vvd........dvv.',
    '..vvdd.dd.ddvv..',
    '..v.v.v..v.v.v..',
    '.v..v..v..v..v..',
    'v...v...v...v..v',
    '................',
  ],
  // All eyes.
  oracle: [
    '................',
    '......aaaa......',
    '....aa.ww.aa....',
    '...a..wkkw..a...',
    '..a....ww....a..',
    '..a.ww....ww.a..',
    '.a.wkkw..wkkw.a.',
    '.a..ww....ww..a.',
    '.a.....ww.....a.',
    '.a....wkkw....a.',
    '..a....ww....a..',
    '..a.ww....ww.a..',
    '...awkkw.wkkwa..',
    '....aww...wwa...',
    '......aaaa......',
    '................',
  ],
  // A cracked crown over an empty face.
  nullroot: [
    '.a...v....v...a.',
    '.aa.vvv..vvv.aa.',
    '.aaavvvvvvvvaaa.',
    '.wwwwwwwwwwwwww.',
    '.w............w.',
    '.w.rrr....rrr.w.',
    '.w.rkr....rkr.w.',
    '.w.rrr....rrr.w.',
    '.w.....wr.....w.',
    '.w......r.....w.',
    '.w.vvvvv.vvvv.w.',
    '.w.v.v.v.v.v..w.',
    '.ww..........ww.',
    '..www.w..w.www..',
    '....ww....ww....',
    '................',
  ],
  // A plain training terminal.
  trainer: [
    '................',
    '..dddddddddddd..',
    '..d..........d..',
    '..d.aaaaaaaa.d..',
    '..d.a......a.d..',
    '..d.a.a..a.a.d..',
    '..d.a......a.d..',
    '..d.a.aaaa.a.d..',
    '..d.a......a.d..',
    '..d.aaaaaaaa.d..',
    '..d..........d..',
    '..dddddddddddd..',
    '......dddd......',
    '....dddddddd....',
    '................',
    '................',
  ],
};

function cells(mask: readonly string[], colorOverride?: string) {
  const out: { x: number; y: number; fill: string }[] = [];
  mask.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x]!;
      if (c === '.') continue;
      out.push({ x, y, fill: colorOverride ?? INK[c] ?? '#ff00ff' });
    }
  });
  return out;
}

interface PortraitProps {
  id: ProtocolId;
  size?: number;
  className?: string;
  /** Draw the containment ring (off for small inline uses). */
  ring?: boolean;
}

export function Portrait({ id, size = 144, className, ring = true }: PortraitProps) {
  const mask = MASKS[id];
  const ghost = cells(mask, '#a970ff');
  const body = cells(mask);
  return (
    <svg viewBox="-4 -4 24 24" width={size} height={size} className={className} aria-hidden shapeRendering="crispEdges">
      {ring && (
        <g className="cl-ring">
          <circle cx={8} cy={8} r={11.2} fill="none" stroke="#3b2a5c" strokeWidth={0.25} />
          <circle cx={8} cy={8} r={10.4} fill="none" stroke="#a970ff" strokeWidth={0.12} strokeDasharray="0.6 1.4" />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const x = 8 + Math.cos(a) * 11.2;
            const y = 8 + Math.sin(a) * 11.2;
            return <rect key={i} x={x - 0.35} y={y - 0.35} width={0.7} height={0.7} fill={i % 3 === 0 ? '#b6ff3c' : '#a970ff'} transform={`rotate(45 ${x} ${y})`} />;
          })}
        </g>
      )}
      <g opacity={0.55} transform="translate(-0.45 0)">
        {ghost.map((c) => (
          <rect key={`g${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={c.fill} />
        ))}
      </g>
      {body.map((c) => (
        <rect key={`b${c.x}-${c.y}`} x={c.x} y={c.y} width={1} height={1} fill={c.fill} />
      ))}
      {/* The terminal's scanlines over the face. */}
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={`s${i}`} x={0} y={i * 2 + 1.55} width={16} height={0.18} fill="#06040a" opacity={0.6} />
      ))}
    </svg>
  );
}
