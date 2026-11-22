/**
 * Drawn art for the shop's BADGE items: one painted medallion per badge id.
 *
 * Like the pets, a badge is a small oil painting built with the brush kit in `painterly.tsx` (no outlines, soft
 * blended forms, mottled colour, knife-ridge texture). This is shop ART (a purchased picture), not site chrome, so
 * its colours are literal and it never follows the `--site-*` tokens. Nothing moves (Steel R5).
 *
 * The frame follows the item's rarity in `lib/shop/catalog.ts`: common painted ring, uncommon pearled bronze ring,
 * rare scalloped silver, epic hexagon, legendary gold sunburst with gems, mythic eight-point star, exotic rainbow
 * rays. Drawn on a 64×64 grid; the emblem sits in a circle of radius 21.5 at (32,32), and the picture has
 * `ART_PAD` of room around it so no rim, ray or point is ever cut by the edge.
 */
import { useId, type ReactNode } from 'react';
import {
  ART_VIEWBOX,
  Blob,
  Fleck,
  Line,
  Paint,
  PaintCtx,
  PaintFilter,
  SoftFilter,
  Twinkle,
  mix,
  pt,
  star,
} from './painterly';

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'exotic';

const C = 32;
const FIELD_R = 21.5;
const FULL = [0, 0, 64, 64] as const;

const GOLD = '#f6d98c';
const SILVER = '#d3d9e6';
const BRONZE = '#e8b88e';
const AMETHYST = '#cdb3f0';
const ROSE = '#f4b3c8';
const CREAM = '#fdf3e2';
const BUTTER = '#fbe08a';

/* ─── frames ─────────────────────────────────────────────────────────────── */

function Ring({ r, fill, seed = 1 }: { r: number; fill: string; seed?: number }) {
  return <Blob cx={C} cy={C} rx={r} fill={fill} lump={0.012} n={14} rim={0.3} seed={seed} />;
}

function FrameBack({ rarity, rim }: { rarity: Rarity; rim: string }) {
  switch (rarity) {
    case 'common':
      return <Ring r={26.5} fill={rim} seed={2} />;
    case 'uncommon':
      return (
        <>
          <Ring r={27.6} fill={BRONZE} seed={3} />
          {Array.from({ length: 8 }, (_, i) => {
            const [x, y] = pt(C, C, 24.9, 22.5 + i * 45);
            return <Fleck key={i} x={x} y={y} r={1.35} fill={CREAM} o={0.95} />;
          })}
        </>
      );
    case 'rare':
      return (
        <>
          {Array.from({ length: 20 }, (_, i) => {
            const [x, y] = pt(C, C, 28, i * 18);
            return <Blob key={i} cx={x} cy={y} rx={3.1} fill={SILVER} n={4} rim={0.2} seed={i + 4} />;
          })}
          <Ring r={26} fill={SILVER} seed={5} />
          <Ring r={23.6} fill={rim} seed={6} />
        </>
      );
    case 'epic': {
      const hex = Array.from({ length: 6 }, (_, i) => pt(C, C, 30.4, i * 60));
      const d = `M${hex.map((p) => p.join(' ')).join('L')}Z`;
      return (
        <>
          <Paint d={d} bb={FULL} fill={AMETHYST} tones={['#b394e6', '#e6d6fa', '#f4c8e0']} n={9} seed={7} />
          <Ring r={25.2} fill={GOLD} seed={8} />
        </>
      );
    }
    case 'legendary':
      return (
        <>
          <Paint
            d={star(C, C, 31.4, 24, 14, 6)}
            bb={FULL}
            fill={GOLD}
            tones={['#f3c768', '#fdeeb8', '#f6cfa0']}
            n={10}
            seed={9}
          />
          <Ring r={26.6} fill={GOLD} seed={10} />
          {[0, 90, 180, 270].map((a, i) => {
            const [x, y] = pt(C, C, 24.2, a);
            return (
              <Blob
                key={a}
                cx={x}
                cy={y}
                rx={i % 2 ? 1.9 : 2.3}
                fill={i % 2 ? '#a9c9f2' : '#f4a3b8'}
                n={3}
                rim={0.2}
                seed={i + 11}
              />
            );
          })}
        </>
      );
    case 'mythic':
      return (
        <>
          <Paint
            d={star(C, C, 31.6, 21.4, 8, 22.5)}
            bb={FULL}
            fill="#bdeee4"
            tones={['#9fe0d4', '#e0faf4']}
            n={7}
            seed={12}
          />
          <Paint
            d={star(C, C, 31.6, 21.4, 8, 0)}
            bb={FULL}
            fill="#f8c6d6"
            tones={['#f2a6bf', '#fde4ec']}
            n={7}
            seed={13}
          />
          <Ring r={26.2} fill={ROSE} seed={14} />
          {Array.from({ length: 8 }, (_, i) => {
            const [x, y] = pt(C, C, 24.2, 22.5 + i * 45);
            return <Fleck key={i} x={x} y={y} r={0.95} fill={CREAM} o={0.95} />;
          })}
        </>
      );
    case 'exotic': {
      const hues = ['#f7a6c0', '#f9c49a', '#f9e49a', '#b6e8b0', '#a6dff0', '#a9b6f2', '#d2aaf0', '#f4a8dc'];
      return (
        <>
          {Array.from({ length: 16 }, (_, i) => {
            const a = i * 22.5;
            const [tx, ty] = pt(C, C, i % 2 ? 28.8 : 31.8, a);
            const [lx, ly] = pt(C, C, 24, a - 11.25);
            const [rx, ry] = pt(C, C, 24, a + 11.25);
            return (
              <Paint
                key={i}
                d={`M${lx} ${ly}L${tx} ${ty}L${rx} ${ry}Z`}
                bb={FULL}
                fill={hues[i % hues.length] as string}
                n={2}
                rim={0.2}
                seed={i + 15}
              />
            );
          })}
          <Ring r={26.4} fill="#e8def8" seed={31} />
          <Ring r={24} fill="#cfe6f6" seed={32} />
        </>
      );
    }
  }
}

/* ─── emblems ────────────────────────────────────────────────────────────── */

type Emblem = () => ReactNode;

const star5: Emblem = () => (
  <>
    <Paint
      d={star(32, 33, 17, 7.4, 5)}
      bb={[15, 16, 49, 50]}
      fill={BUTTER}
      tones={['#f6c866', '#fff2c4']}
      n={7}
      seed={2}
    />
    <Fleck x={20} y={20} r={0.9} fill="#ffffff" />
    <Fleck x={45} y={22} r={0.7} fill="#ffffff" />
  </>
);

const sprout: Emblem = () => (
  <>
    <Blob cx={32} cy={43.5} rx={15} ry={5} fill="#d9b494" tones={['#c49a78', '#ecd0b4']} n={4} seed={2} />
    <Line d="M32 43Q32 34 32 27" color="#7fbf8a" w={2.4} o={1} />
    <Paint d="M32 34Q21 34 20 24Q30 24 32 34Z" bb={[20, 24, 32, 34]} fill="#a9e0a0" n={4} seed={3} />
    <Paint d="M32 30Q42 30 44 20Q34 20 32 30Z" bb={[32, 20, 44, 30]} fill="#9bd894" n={4} seed={4} />
  </>
);

const fire: Emblem = () => (
  <>
    <Paint
      d="M32 14Q36 23 42 27Q47 34 44 41Q41 49 32 49Q23 49 20 41Q17 34 23 27Q25 31 28 32Q27 23 32 14Z"
      bb={[17, 14, 47, 49]}
      fill="#f7a58a"
      tones={['#f28a72', '#fbc9a0', '#f9dc8c']}
      n={8}
      angle={-80}
      seed={2}
    />
    <Paint
      d="M32 29Q36 35 38 40Q38 46 32 47Q26 46 26 40Q26 35 32 29Z"
      bb={[26, 29, 38, 47]}
      fill="#fbe08a"
      tones={['#f9c866', '#fff4c8']}
      n={4}
      angle={-80}
      seed={3}
    />
  </>
);

const heart: Emblem = () => (
  <Paint
    d="M32 47C17 37 18 22 27 21C30 21 32 23 32 26C32 23 34 21 37 21C46 22 47 37 32 47Z"
    bb={[17, 20, 47, 47]}
    fill="#f7a3c0"
    tones={['#ee86ab', '#fbc9dc', '#f9b8a0']}
    n={8}
    seed={2}
  />
);

const bolt: Emblem = () => (
  <Paint
    d="M36 13L21 34L30 34L26 51L44 27L35 27L40 13Z"
    bb={[21, 13, 44, 51]}
    fill={BUTTER}
    tones={['#f6c866', '#fff2c4', '#f9b8a0']}
    n={7}
    angle={-70}
    seed={2}
  />
);

const crown: Emblem = () => (
  <>
    <Paint
      d="M19 42L17 24L26 32L32 19L38 32L47 24L45 42Z"
      bb={[17, 19, 47, 42]}
      fill={BUTTER}
      tones={['#f6c866', '#fff2c4']}
      n={7}
      seed={2}
    />
    <Paint d="M19 42H45V47Q32 50 19 47Z" bb={[19, 42, 45, 49]} fill="#f3c968" n={4} seed={3} />
    <Blob cx={25} cy={44.6} rx={1.7} fill="#f4a3b8" n={3} rim={0} seed={4} />
    <Blob cx={32} cy={45} rx={1.8} fill="#a9c9f2" n={3} rim={0} seed={5} />
    <Blob cx={39} cy={44.6} rx={1.7} fill="#a9e0b8" n={3} rim={0} seed={6} />
  </>
);

const diamond: Emblem = () => (
  <>
    <Paint
      d="M21 25L27 17H37L43 25L32 48Z"
      bb={[21, 17, 43, 48]}
      fill="#6fc4e8"
      tones={['#52b0dc', '#c6ecf9', '#c4b4ee']}
      n={8}
      seed={2}
    />
    <Line d="M21 25H43M27 17L30 25L32 48M37 17L34 25L32 48" color="#ffffff" w={0.9} o={0.7} />
    <Twinkle x={26} y={22} r={2.4} fill="#ffffff" />
  </>
);

const galaxy: Emblem = () => (
  <>
    <Line d="M32 32Q38 24 45 31Q48 40 37 44Q24 46 19 35Q16 22 30 17" color="#ffffff" w={3.2} o={0.95} />
    <Line d="M32 32Q27 38 33 40Q40 38 38 31" color="#f7c3e8" w={2.2} o={0.9} />
    <Line d="M30 17Q40 14 46 20" color="#bde0f8" w={2} o={0.8} />
    <Blob cx={32} cy={32} rx={3.4} fill="#ffffff" n={3} rim={0} seed={2} />
    <Fleck x={22} y={24} r={0.8} fill="#ffffff" />
    <Fleck x={44} y={42} r={0.9} fill="#ffffff" />
    <Fleck x={40} y={20} r={0.6} fill="#ffffff" />
    <Fleck x={20} y={42} r={0.7} fill="#ffffff" />
  </>
);

const sparkle: Emblem = () => (
  <>
    <Paint
      d={star(32, 32, 17.5, 3.6, 4)}
      bb={[14, 14, 50, 50]}
      fill={BUTTER}
      tones={['#f6c866', '#fff2c4']}
      n={6}
      seed={2}
    />
    <Paint d={star(44, 21, 6, 1.6, 4)} bb={[38, 15, 50, 27]} fill="#f6e8ff" n={2} rim={0.1} seed={3} />
    <Paint d={star(20, 43, 5, 1.4, 4)} bb={[15, 38, 25, 48]} fill="#f6e8ff" n={2} rim={0.1} seed={4} />
  </>
);

const rocket: Emblem = () => (
  <g transform="rotate(35 32 32)">
    <Paint d="M24 36L16 46L25 42Z" bb={[16, 36, 25, 46]} fill="#f7a3a3" n={2} rim={0.2} />
    <Paint d="M40 36L48 46L39 42Z" bb={[39, 36, 48, 46]} fill="#f7a3a3" n={2} rim={0.2} />
    <Paint d="M28 44Q32 56 36 44Z" bb={[28, 44, 36, 56]} fill={BUTTER} n={3} rim={0.1} seed={2} />
    <Paint
      d="M32 13Q42 22 41 41H23Q22 22 32 13Z"
      bb={[22, 13, 42, 41]}
      fill="#fdf4f4"
      tones={['#e8dfe8', '#fbe0e4']}
      n={6}
      seed={3}
    />
    <Paint d="M32 13Q37 18 39 25H25Q27 18 32 13Z" bb={[25, 13, 39, 25]} fill="#f7a3a3" n={3} rim={0.2} seed={4} />
    <Blob cx={32} cy={31} rx={3.6} fill="#a9d4f0" n={4} rim={0.3} seed={5} />
  </g>
);

const clover: Emblem = () => (
  <>
    <Line d="M32 32Q34 41 40 47" color="#7fbf8a" w={2} o={1} />
    {[0, 90, 180, 270].map((a, i) => (
      <g key={a} transform={`rotate(${a} 32 32)`}>
        <Paint
          d="M32 31C25 28 23 19 28 17.5C31 17 32 20 32 22C32 20 33 17 36 17.5C41 19 39 28 32 31Z"
          bb={[23, 17, 41, 31]}
          fill="#9fdca0"
          tones={['#86cf8c', '#c8eeb8']}
          n={4}
          seed={i + 2}
        />
      </g>
    ))}
  </>
);

const trophy: Emblem = () => (
  <>
    <Line d="M23 20Q14 20 17 28Q19 32 24 31M41 20Q50 20 47 28Q45 32 40 31" color="#f3c968" w={2.4} o={1} />
    <Paint
      d="M23 17H41V28Q41 38 32 39Q23 38 23 28Z"
      bb={[23, 17, 41, 39]}
      fill={BUTTER}
      tones={['#f6c866', '#fff2c4']}
      n={6}
      seed={2}
    />
    <Paint d="M29 39H35V44H29Z" bb={[29, 39, 35, 44]} fill="#f3c968" n={2} rim={0.2} seed={3} />
    <Paint d="M23 44H41V49H23Z" bb={[23, 44, 41, 49]} fill="#f0bf5e" n={3} rim={0.2} seed={4} />
    <Twinkle x={32} y={27} r={4} fill="#ffffff" />
  </>
);

const game: Emblem = () => (
  <>
    <Paint
      d="M17 38Q15 27 22 25H42Q49 27 47 38Q46 45 41 43L37 38H27L23 43Q18 45 17 38Z"
      bb={[15, 25, 49, 45]}
      fill="#efe4fb"
      tones={['#d9c8f2', '#fbe6f0']}
      n={7}
      seed={2}
    />
    <Line d="M24 29V35M21 32H27" color="#8a7ab0" w={2.2} o={0.9} />
    <Blob cx={40} cy={30} rx={1.7} fill="#f4a3b8" n={3} rim={0} seed={3} />
    <Blob cx={44} cy={33} rx={1.7} fill="#a9e0b8" n={3} rim={0} seed={4} />
    <Blob cx={40} cy={36} rx={1.7} fill="#a9c9f2" n={3} rim={0} seed={5} />
    <Blob cx={36} cy={33} rx={1.7} fill={BUTTER} n={3} rim={0} seed={6} />
  </>
);

const crystal: Emblem = () => (
  <>
    <Paint d="M22 47Q32 43 42 47V50H22Z" bb={[22, 43, 42, 50]} fill={BUTTER} n={3} rim={0.2} seed={2} />
    <Blob
      cx={32}
      cy={31}
      rx={14.5}
      fill="#b78eec"
      tones={['#9a70dc', '#e6d6fb', '#f2b8e0']}
      lump={0.015}
      n={12}
      seed={3}
    />
    <Line d="M22 30Q28 26 34 32Q40 36 44 31" color="#f7ecff" w={1.6} o={0.8} />
    <Twinkle x={36} y={24} r={2.6} fill="#ffffff" />
    <Twinkle x={26} y={36} r={1.8} fill="#fbe9a8" />
  </>
);

const comet: Emblem = () => (
  <>
    <Line d="M36 28Q26 34 14 46" color="#f6a87a" w={7} o={0.95} />
    <Line d="M34 24Q24 27 14 35" color="#fbe0a8" w={3.6} o={0.9} />
    <Line d="M40 32Q33 41 24 49" color="#f7b9a0" w={3.2} o={0.9} />
    <Blob cx={40} cy={24} rx={8.4} fill="#f8b88a" tones={['#f29a6a', '#fde0b8']} lump={0.03} seed={2} />
    <Fleck x={21} y={21} r={0.8} fill="#ffffff" />
    <Fleck x={46} y={42} r={0.9} fill="#ffffff" />
    <Fleck x={18} y={30} r={0.6} fill="#ffffff" />
  </>
);

const unicorn: Emblem = () => (
  <>
    <Line d="M27 22Q17 28 19 41" color="#f4a3b8" w={2.2} o={0.95} />
    <Line d="M28 24Q20 30 22 42" color={BUTTER} w={2} o={0.95} />
    <Line d="M29 26Q23 32 25 43" color="#a9e0b8" w={2} o={0.95} />
    <Line d="M30 28Q26 33 28 44" color="#a9c9f2" w={1.8} o={0.95} />
    <Paint
      d="M23 46Q21 32 28 25Q31 23 35 23L41 29Q45 33 41 37Q37 37 35 41L33 47Z"
      bb={[21, 23, 45, 47]}
      fill="#fdf9ff"
      tones={['#e7dcf6', '#fbe6f0']}
      n={6}
      seed={2}
    />
    <Paint d="M34 24L39 9L40 26Z" bb={[34, 9, 40, 26]} fill={BUTTER} n={2} rim={0.2} seed={3} />
    <Paint d="M29 24L28 17L33 22Z" bb={[28, 17, 33, 24]} fill="#fdf9ff" n={1} rim={0.2} seed={4} />
    <Blob cx={36.6} cy={30} rx={1.2} fill="#33283d" n={3} rim={0} seed={5} />
  </>
);

const skull: Emblem = () => (
  <>
    <Paint
      d="M20 31Q20 16 32 16Q44 16 44 31Q44 36 40 38V44H24V38Q20 36 20 31Z"
      bb={[20, 16, 44, 44]}
      fill="#fbf1e4"
      tones={['#ecdcc8', '#f4e0ec']}
      n={7}
      seed={2}
    />
    <Blob cx={27} cy={30} rx={4} ry={4.8} fill="#6b5a8a" n={5} rim={0} seed={3} />
    <Blob cx={37} cy={30} rx={4} ry={4.8} fill="#6b5a8a" n={5} rim={0} seed={4} />
    <Paint d="M30.4 36.4L32 33.6L33.6 36.4Z" bb={[30, 33, 34, 37]} fill="#b9a2b0" n={1} rim={0} />
    <Line d="M28 44V40M32 44V40M36 44V40" color="#b9a2b0" w={0.9} o={0.8} />
  </>
);

const dragon: Emblem = () => (
  <>
    <Paint d="M25 22L20 11L31 20Z" bb={[20, 11, 31, 22]} fill={BUTTER} n={2} rim={0.2} seed={2} />
    <Paint d="M34 20L36 10L40 21Z" bb={[34, 10, 40, 21]} fill={BUTTER} n={2} rim={0.2} seed={3} />
    <Paint
      d="M18 41Q14 28 24 22Q32 17 41 22L47 28Q49 32 44 33L38 32Q40 38 33 43Q25 46 18 41Z"
      bb={[14, 17, 49, 46]}
      fill="#a9e0b8"
      tones={['#86cf9c', '#d1f2dc', '#f4e6b4']}
      n={8}
      seed={4}
    />
    <Blob cx={34} cy={26} rx={2.6} ry={2} fill={BUTTER} n={3} rim={0} seed={5} />
    <Blob cx={34.4} cy={26} rx={1.1} fill="#33283d" n={3} rim={0} seed={6} />
    <Fleck x={46} y={28} r={0.9} fill="#33283d" o={0.6} />
  </>
);

const atom: Emblem = () => (
  <>
    {[
      { a: 0, c: '#a9d4f0' },
      { a: 60, c: '#a9e0c8' },
      { a: 120, c: '#d2b8f0' },
    ].map(({ a, c }) => (
      <ellipse
        key={a}
        cx={32}
        cy={32}
        rx={16}
        ry={6.4}
        transform={`rotate(${a} 32 32)`}
        fill="none"
        stroke={c}
        strokeWidth={2}
        opacity={0.95}
      />
    ))}
    <Blob cx={32} cy={32} rx={4.2} fill="#f4a3b8" n={4} seed={2} />
    <Fleck x={48} y={32} r={1.7} fill="#fbe08a" />
    <Fleck x={24} y={18.4} r={1.6} fill="#fbe08a" />
    <Fleck x={24} y={45.6} r={1.6} fill="#fbe08a" />
  </>
);

const milkyWay: Emblem = () => (
  <>
    <Line d="M17 46Q32 36 47 19" color="#a994e8" w={11} o={0.95} />
    <Line d="M18 45Q32 36 46 20" color="#f0a6d8" w={5.6} o={0.9} />
    <Line d="M20 44Q32 37 44 22" color="#fff4fb" w={2} o={0.8} />
    <Fleck x={22} y={24} r={0.9} fill="#ffffff" />
    <Fleck x={42} y={40} r={0.8} fill="#ffffff" />
    <Fleck x={46} y={30} r={0.7} fill="#ffffff" />
    <Fleck x={18} y={36} r={0.7} fill="#ffffff" />
    <Twinkle x={40} y={18} r={2.4} fill="#fbe9a8" />
    <Twinkle x={24} y={42} r={2} fill="#ffffff" />
  </>
);

/* ─── registry ───────────────────────────────────────────────────────────── */

interface BadgeDef {
  rarity: Rarity;
  /** The field the emblem sits on: the painted base colour. */
  field: string;
  /** The ring colour (common) or the inner ring (rare). */
  rim: string;
  emblem: Emblem;
}

const BADGES: Record<string, BadgeDef> = {
  'badge.star': { rarity: 'common', field: '#a9b8ee', rim: '#f7dc8c', emblem: star5 },
  'badge.newcomer': { rarity: 'common', field: '#d4f0fb', rim: '#b6e6a8', emblem: sprout },
  'badge.fire': { rarity: 'common', field: '#f6c0b2', rim: '#f7b48a', emblem: fire },
  'badge.heart': { rarity: 'common', field: '#ecb8e2', rim: '#f7b3cc', emblem: heart },
  'badge.bolt': { rarity: 'rare', field: '#c9b8f2', rim: '#a9e0f7', emblem: bolt },
  'badge.crown': { rarity: 'epic', field: '#a9bdf0', rim: GOLD, emblem: crown },
  'badge.diamond': { rarity: 'epic', field: '#b3e0e0', rim: GOLD, emblem: diamond },
  'badge.galaxy': { rarity: 'legendary', field: '#b9a6ea', rim: GOLD, emblem: galaxy },
  'badge.x.sparkle': { rarity: 'common', field: '#c8b4f0', rim: '#e3d2fb', emblem: sparkle },
  'badge.x.rocket': { rarity: 'common', field: '#a9c9f2', rim: '#f7b3b3', emblem: rocket },
  'badge.x.clover': { rarity: 'common', field: '#fdf1c4', rim: '#b6e6a8', emblem: clover },
  'badge.x.trophy': { rarity: 'uncommon', field: '#a9dfe4', rim: '#a8e6f4', emblem: trophy },
  'badge.x.game': { rarity: 'uncommon', field: '#f0b3df', rim: '#f4c2e8', emblem: game },
  'badge.x.crystal': { rarity: 'rare', field: '#cdb0ee', rim: '#e6c8f8', emblem: crystal },
  'badge.x.comet': { rarity: 'rare', field: '#a9b8e8', rim: '#f9cfae', emblem: comet },
  'badge.x.unicorn': { rarity: 'epic', field: '#e1d2fb', rim: GOLD, emblem: unicorn },
  'badge.x.skull': { rarity: 'epic', field: '#e8b3b8', rim: GOLD, emblem: skull },
  'badge.x.dragon': { rarity: 'legendary', field: '#f2b8a8', rim: GOLD, emblem: dragon },
  'badge.x.atom': { rarity: 'mythic', field: '#a9d4f0', rim: ROSE, emblem: atom },
  'badge.x.milky-way': { rarity: 'exotic', field: '#b0bde8', rim: GOLD, emblem: milkyWay },
};

export const BADGE_ART_IDS: readonly string[] = Object.freeze(Object.keys(BADGES));

export function hasBadgeArt(id: string | undefined | null): boolean {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(BADGES, id);
}

export function BadgeArt({
  id,
  size,
  className,
  title,
}: {
  id: string;
  size: number;
  className?: string;
  title?: string;
}) {
  const raw = useId();
  // The badge id is part of the prefix: two React roots (islands) both start their `useId` sequence at the same value,
  // so the id alone would let one badge's gradients resolve to another's. Two copies of one badge draw identically.
  const p = `ba${id.replace(/[^a-zA-Z0-9]/g, '')}${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const def = hasBadgeArt(id) ? BADGES[id] : undefined;
  if (!def) return null;
  return (
    <svg
      viewBox={ART_VIEWBOX}
      width={size}
      height={size}
      className={className}
      overflow="visible"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <PaintFilter id={`${p}-paint`} seed={2} />
        <SoftFilter id={`${p}-soft`} />
      </defs>
      <PaintCtx.Provider value={p}>
        <g filter={`url(#${p}-paint)`}>
          <FrameBack rarity={def.rarity} rim={def.rim} />
          <Blob
            cx={C}
            cy={C}
            rx={FIELD_R}
            fill={mix(def.field, '#4b3856', 0.1)}
            tones={[mix(def.field, '#ffffff', 0.4), mix(def.field, '#4b3856', 0.22)]}
            lump={0.012}
            n={14}
            rim={0.35}
            seed={3}
          />
          {def.emblem()}
        </g>
      </PaintCtx.Provider>
    </svg>
  );
}
