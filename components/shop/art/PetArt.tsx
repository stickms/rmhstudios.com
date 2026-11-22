/**
 * Shop pet art: one hand-painted picture per `PET` item in `lib/shop/catalog.ts`.
 *
 * Each pet is its own small oil painting on a 64×64 grid: a soft painted backdrop (`Wash`), then the animal built
 * from lumpy painted forms with no outlines (see the brush kit in `painterly.tsx`), a bead eye and a few thin
 * strokes for legs, whiskers and twigs. Every pet has its own pose, setting and palette. This is a purchased
 * picture, not site chrome, so it carries its own literal palette. Everything is static (Steel R5).
 */
import { useId, type ReactElement, type ReactNode } from 'react';
import {
  ART_VIEWBOX,
  Bead,
  Blob,
  Fleck,
  INK,
  Limb,
  Line,
  Paint,
  PaintCtx,
  PaintFilter,
  SoftFilter,
  Twinkle,
  Wash,
} from './painterly';

const CREAM = '#fbf1e0';

/** A blossom: five round petals around a warm centre. */
function Blossom({
  x,
  y,
  r = 2.4,
  fill = '#f5b3c8',
  seed = 1,
}: {
  x: number;
  y: number;
  r?: number;
  fill?: string;
  seed?: number;
}) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a, i) => (
        <Blob
          key={a}
          cx={x + Math.cos((a * Math.PI) / 180) * r * 0.8}
          cy={y + Math.sin((a * Math.PI) / 180) * r * 0.8}
          rx={r * 0.62}
          fill={fill}
          n={2}
          rim={0.15}
          seed={seed + i}
        />
      ))}
      <Fleck x={x} y={y} r={r * 0.32} fill="#f6d77f" />
    </g>
  );
}

function Leaf({
  x,
  y,
  rot = 0,
  s = 1,
  fill = '#a6d29a',
}: {
  x: number;
  y: number;
  rot?: number;
  s?: number;
  fill?: string;
}) {
  return <Blob cx={x} cy={y} rx={4 * s} ry={2 * s} rot={rot} fill={fill} n={2} rim={0.2} lump={0.1} />;
}

/* ─── the pets ───────────────────────────────────────────────────────────── */

/** A grey-lilac cat in profile, sitting on a blossoming branch. */
function Cat() {
  const fur = '#b9b6d8';
  return (
    <>
      <Wash colors={['#f6d6c6', '#c4dfe9', '#f9e8cb', '#e9cbd9']} seed={11} />
      <Line d="M1 51Q22 44 44 49Q54 51 63 46" color="#8b7a85" w={2.4} o={0.9} />
      <Line d="M44 49Q50 42 55 39" color="#8b7a85" w={1.4} o={0.9} />
      <Leaf x={52} y={46} rot={-30} />
      <Blossom x={55} y={38} r={2.6} seed={3} />
      <Blossom x={49} y={41} r={1.9} seed={8} />
      <Limb d="M20 50Q6 51 8 38Q10 29 17 32" w={5.5} fill={fur} />
      <Blob cx={29} cy={42} rx={11} ry={13} rot={14} fill={fur} tones={['#9a97c2', '#dcd6ee', '#e8d3df']} seed={2} />
      <Blob cx={36} cy={41} rx={5} ry={8.5} fill="#f6eef0" n={4} rim={0.12} seed={5} />
      <Paint d="M28 20Q27 11 31 9Q36 12 37 18Z" bb={[27, 9, 37, 20]} fill={fur} n={3} rim={0.2} />
      <Paint d="M41 17Q45 10 49 10Q49 18 46 23Z" bb={[41, 10, 49, 23]} fill={fur} n={3} rim={0.2} />
      <Blob cx={38} cy={26} rx={10.5} ry={9.4} fill="#bdbadc" tones={['#a5a2cc', '#e3def2', '#ebd5e0']} seed={6} />
      <Blob cx={44.5} cy={30} rx={4.6} ry={3.4} fill="#f7efee" n={3} rim={0.1} seed={9} />
      <Bead x={42} y={25} r={1.9} ring="#a9d9a0" />
      <Bead x={33} y={25.6} r={1.6} ring="#a9d9a0" />
      <Fleck x={47.6} y={29} r={1.1} fill="#e98aa3" o={1} />
      <Line d="M46 31Q52 30 57 31.5M46 32Q51 33.5 56 36" color="#6a5a78" w={0.5} o={0.5} />
      <Line d="M36 52L35 57M30 53L29 57" color="#7a6e90" w={2.6} o={0.9} />
      <Blob cx={34.6} cy={58} rx={3} ry={1.7} fill="#f6eef0" n={3} rim={0.1} seed={4} />
      <Blob cx={26} cy={57} rx={4.4} ry={2} fill="#f6eef0" n={3} rim={0.1} seed={7} />
      <Twinkle x={9} y={14} r={2} />
    </>
  );
}

/** A baby dragon hatching from a cracked egg. */
function BabyDragon() {
  const hide = '#a3dabf';
  return (
    <>
      <Wash colors={['#cfe9dd', '#f7d6dc', '#fbeec9', '#bfe0e8']} seed={21} />
      <Paint
        d="M25 40Q7 36 6 19Q15 19 20 28Q20 19 25 14Q31 25 30 38Z"
        bb={[6, 14, 30, 40]}
        fill="#f4b9c8"
        tones={['#fbd3dc', '#e79fb8', '#f8c9a8']}
        n={6}
        seed={2}
      />
      <Paint
        d="M39 40Q57 36 58 19Q49 19 44 28Q44 19 39 14Q33 25 34 38Z"
        bb={[34, 14, 58, 40]}
        fill="#f4b9c8"
        tones={['#fbd3dc', '#e79fb8', '#f8c9a8']}
        n={6}
        seed={3}
      />
      <Limb d="M42 50Q58 50 56 38Q55 32 50 35" w={4.5} fill={hide} />
      <Blob cx={32} cy={44} rx={10} ry={9} fill={hide} tones={['#8fcfb2', '#c6ecd8', '#f1e3b0']} seed={4} />
      <Blob cx={32} cy={47} rx={5.4} ry={6.4} fill="#fbeab2" n={4} rim={0.12} seed={5} />
      <Paint d="M25 24Q22 16 24 11Q29 15 30 22Z" bb={[22, 11, 30, 24]} fill="#f7d3aa" n={2} rim={0.15} />
      <Paint d="M39 24Q42 16 40 11Q35 15 34 22Z" bb={[34, 11, 42, 24]} fill="#f7d3aa" n={2} rim={0.15} />
      <Blob cx={32} cy={30.5} rx={11} ry={9.2} fill="#abdfc5" tones={['#8fcfb2', '#d1efe0', '#f4e6b4']} seed={6} />
      <Blob cx={32} cy={35} rx={6} ry={3.8} fill="#d3f0df" n={3} rim={0.1} seed={7} />
      <Fleck x={30} y={35} r={0.7} fill={INK} o={0.6} />
      <Fleck x={34} y={35} r={0.7} fill={INK} o={0.6} />
      <Bead x={26.6} y={29} r={2.5} ring="#fbe9a8" />
      <Bead x={37.4} y={29} r={2.5} ring="#fbe9a8" />
      <Paint
        d="M12 56Q10 46 19 44L23 50L28 45L33 51L38 45L43 51L47 45Q55 47 52 57Q47 62 32 62Q17 62 12 56Z"
        bb={[10, 44, 55, 62]}
        fill={CREAM}
        tones={['#ecdcc2', '#f7e4e8', '#fff8ea']}
        n={8}
        seed={8}
      />
      <Twinkle x={11} y={11} r={2.2} />
      <Twinkle x={56} y={12} r={1.7} fill="#e3d4f7" />
    </>
  );
}

/** A tilting, floating ghost in a dusky sky. */
function Ghost() {
  return (
    <>
      <Wash
        colors={['#a9a2d6', '#8fb0dc', '#e4bcd8', '#9a8ccc']}
        seed={31}
        speckle={['#ffffff', '#f6dc90', '#b9a8e8']}
      />
      <g transform="rotate(-7 32 34)">
        <Paint
          d="M17 55Q9 44 14 32Q13 11 32 10Q51 11 50 32Q55 44 47 55Q43 50 40 55Q36 50 32 57Q28 50 24 55Q21 50 17 55Z"
          bb={[9, 10, 55, 57]}
          fill="#f5f1fc"
          tones={['#cfc4ee', '#fde4ee', '#bccdf0']}
          n={9}
          angle={-70}
          rim={0.32}
          seed={2}
        />
        <Blob cx={14} cy={37} rx={3.4} ry={5.2} rot={20} fill="#f1edfa" n={3} rim={0.2} seed={3} />
        <Blob cx={51} cy={32} rx={3.4} ry={5.2} rot={-25} fill="#f1edfa" n={3} rim={0.2} seed={4} />
        <Bead x={26} y={28} r={2.7} />
        <Bead x={38} y={28} r={2.7} />
        <Blob cx={32} cy={36} rx={2.2} ry={3} fill="#a07ba6" n={3} rim={0} seed={5} />
        <Blob cx={22} cy={34} rx={2.6} ry={1.5} fill="#f4b6cd" n={2} rim={0} seed={6} />
        <Blob cx={42} cy={34} rx={2.6} ry={1.5} fill="#f4b6cd" n={2} rim={0} seed={7} />
      </g>
      <Line d="M52 22Q60 18 58 10" color="#f4f0fb" w={1.8} o={0.7} />
      <Twinkle x={9} y={16} r={2.4} fill="#e8dcff" />
      <Twinkle x={56} y={46} r={1.8} />
      <Twinkle x={11} y={46} r={1.5} fill="#f3d3ea" />
    </>
  );
}

/** A small steel robot looking sideways, holding a flower it has grown. */
function Robot() {
  const steel = '#a9bcd6';
  return (
    <>
      <Wash colors={['#bfe3e1', '#f7d9c6', '#e3d9f2', '#fbeec8']} seed={41} />
      <Line d="M32 17Q31 11 35 8" color="#8d9bb8" w={1.5} o={0.9} />
      <Blob cx={35.5} cy={7} rx={2.4} fill="#f4a9a0" n={3} rim={0.1} seed={2} />
      <Limb d="M23 44Q14 47 15 54" w={4.2} fill={steel} />
      <Limb d="M42 44Q51 42 50 36" w={4.2} fill={steel} />
      <Line d="M50 36V25" color="#7fb98a" w={1.6} o={0.9} />
      <Blossom x={50} y={22} r={2.6} fill="#f4b3c4" seed={5} />
      <Blob cx={32} cy={47} rx={10} ry={9.5} rot={4} fill={steel} tones={['#a9bbd4', '#e3e8f2', '#f4d9cc']} seed={3} />
      <Blob cx={32} cy={47} rx={4} ry={3.4} fill="#f5b3a6" n={4} rim={0.1} seed={4} />
      <Blob cx={19.5} cy={27} rx={2.4} ry={3.4} fill="#e9b98e" n={3} rim={0.1} seed={6} />
      <Blob cx={44.5} cy={27} rx={2.4} ry={3.4} fill="#e9b98e" n={3} rim={0.1} seed={7} />
      <Blob
        cx={32}
        cy={27}
        rx={12.5}
        ry={10.5}
        fill="#c3d1e4"
        tones={['#a3b6d2', '#eaeff7', '#f1ddd2']}
        lump={0.04}
        seed={8}
      />
      <Blob
        cx={32}
        cy={28}
        rx={9}
        ry={6.4}
        fill="#5f7fae"
        tones={['#4b6a9a', '#8aa8cf']}
        lump={0.04}
        rim={0.4}
        n={5}
        seed={9}
      />
      <Blob cx={28} cy={28} rx={2.2} ry={2.8} fill="#cdf5e6" n={3} rim={0} seed={10} />
      <Blob cx={36.6} cy={28} rx={2.2} ry={2.8} fill="#cdf5e6" n={3} rim={0} seed={11} />
      <Line d="M29.4 33Q32 34.6 34.8 33" color="#f4eef4" w={0.9} o={0.9} />
      <Blob cx={26.6} cy={58} rx={4} ry={1.9} fill="#9fb0c9" n={3} rim={0.1} seed={12} />
      <Blob cx={37.4} cy={58} rx={4} ry={1.9} fill="#9fb0c9" n={3} rim={0.1} seed={13} />
      <Twinkle x={10} y={14} r={1.8} fill="#cdf5e6" />
    </>
  );
}

/** A fox sitting 3/4 with its big tail curled round. */
function Fox() {
  const red = '#f2a36f';
  return (
    <>
      <Wash
        colors={['#f7d2b3', '#bfe0dc', '#fbe9c6', '#f0c3b8']}
        seed={51}
        speckle={['#f1c86b', '#c97a5c', '#ffffff']}
      />
      <Paint
        d="M40 52Q61 57 60 36Q58 24 47 21Q55 33 44 42Z"
        bb={[40, 21, 60, 55]}
        fill={red}
        tones={['#e98a5a', '#f9c79c', '#c97a5c']}
        n={9}
        angle={-60}
        seed={2}
      />
      <Blob cx={51} cy={26} rx={3.8} ry={4.4} rot={-20} fill={CREAM} n={4} rim={0.1} seed={3} />
      <Blob cx={29} cy={44} rx={11.5} ry={13} rot={8} fill={red} tones={['#e98a5a', '#f9c79c', '#d4876a']} seed={4} />
      <Blob cx={34} cy={45} rx={5.5} ry={9} fill={CREAM} n={4} rim={0.1} seed={5} />
      <Line d="M28 54L27 59M35 55L36 59" color="#5f4a55" w={2.4} o={0.9} />
      <Paint d="M26 22Q23 10 28 7Q34 11 36 18Z" bb={[23, 7, 36, 22]} fill={red} n={3} rim={0.2} />
      <Paint d="M40 18Q44 9 49 10Q49 19 45 24Z" bb={[40, 9, 49, 24]} fill={red} n={3} rim={0.2} />
      <Blob cx={28} cy={14.5} rx={2.2} ry={3.2} rot={-12} fill="#7a5560" n={3} rim={0} seed={6} />
      <Blob cx={34} cy={27} rx={11} ry={9.4} fill="#f4a874" tones={['#e98a5a', '#fbd0a2', '#d98a62']} seed={7} />
      <Blob cx={41} cy={31} rx={6} ry={4} rot={-8} fill={CREAM} n={4} rim={0.1} seed={8} />
      <Bead x={38} y={25.6} r={1.9} ring="#f9d89a" />
      <Bead x={29} y={26} r={1.5} ring="#f9d89a" />
      <Fleck x={46.4} y={30} r={1.6} fill="#4a3a48" o={1} />
      <Twinkle x={9} y={16} r={2} fill="#fbe9a8" />
    </>
  );
}

/** A panda sitting among bamboo, nibbling a stalk. */
function Panda() {
  const dark = '#6f6b8a';
  return (
    <>
      <Wash colors={['#cfe6c6', '#e9f1d6', '#bfdcd2', '#f6e7c8']} seed={61} />
      <Line d="M52 3V60" color="#9fd29a" w={3.2} o={0.95} />
      <Line d="M58 8V58" color="#b7dea8" w={2.2} o={0.9} />
      <Line d="M49.5 22h5M49.8 40h4.6M55.8 28h4.4" color="#6fae7a" w={0.9} o={0.7} />
      <Leaf x={46} y={14} rot={30} s={1.2} fill="#8fcb8a" />
      <Leaf x={60} y={20} rot={-30} s={1.1} fill="#a8d9a0" />
      <Blob cx={29} cy={44} rx={13} ry={12.5} fill="#fbf7ef" tones={['#e6dfd6', '#f2e8f0', '#dfe6f0']} seed={2} />
      <Blob cx={20} cy={55} rx={5.2} ry={4} fill={dark} n={3} rim={0.2} seed={3} />
      <Blob cx={38} cy={56} rx={5.2} ry={3.6} fill={dark} n={3} rim={0.2} seed={4} />
      <Limb d="M37 40Q46 39 47 30" w={5.4} fill={dark} />
      <Blob cx={47} cy={28} rx={3} ry={2.8} fill={dark} n={3} rim={0.1} seed={5} />
      <Blob cx={20} cy={15.5} rx={3.8} fill={dark} n={4} rim={0.1} seed={6} />
      <Blob cx={39} cy={15.5} rx={3.8} fill={dark} n={4} rim={0.1} seed={7} />
      <Blob cx={29.5} cy={24} rx={11} ry={9.8} fill="#fcf8f0" tones={['#e9e2da', '#f5ecf2']} seed={8} />
      <Blob cx={24} cy={24.5} rx={2.8} ry={3.7} rot={-22} fill={dark} n={4} rim={0} seed={9} />
      <Blob cx={35.5} cy={24.5} rx={2.8} ry={3.7} rot={22} fill={dark} n={4} rim={0} seed={10} />
      <Fleck x={24.4} y={24.2} r={1.1} fill="#ffffff" o={0.95} />
      <Fleck x={35.1} y={24.2} r={1.1} fill="#ffffff" o={0.95} />
      <Blob cx={29.5} cy={29} rx={2.1} ry={1.5} fill="#4a4458" n={3} rim={0} seed={11} />
      <Line d="M29.5 30.4Q28 32.4 26.4 31.6M29.5 30.4Q31 32.4 32.6 31.6" color="#6a5a74" w={0.6} o={0.7} />
      <Blob cx={20.6} cy={29.6} rx={2.4} ry={1.4} fill="#f4b6c4" n={2} rim={0} seed={12} />
    </>
  );
}

/** A penguin on pale ice, chin up. */
function Penguin() {
  const coat = '#8d9ec8';
  return (
    <>
      <Wash
        colors={['#c9dff2', '#f5d8e0', '#e4eefa', '#fbe9d0']}
        seed={71}
        speckle={['#ffffff', '#b9d4ee', '#f6c9d4']}
      />
      <Blob cx={32} cy={58} rx={22} ry={4} fill="#f3f8fc" tones={['#dbe9f6', '#ffffff']} n={4} rim={0.15} seed={2} />
      <Blob
        cx={32}
        cy={38}
        rx={13}
        ry={19.5}
        fill={coat}
        tones={['#6f82b4', '#aebbe0', '#c9b8dc']}
        angle={-80}
        seed={3}
      />
      <Blob cx={35} cy={42} rx={7.6} ry={14} rot={-4} fill="#fdf6ee" tones={['#efe4d8', '#fbe3e8']} seed={4} />
      <Paint
        d="M20 28Q8 39 13 50Q19 45 22 38Z"
        bb={[8, 28, 22, 50]}
        fill="#7d90bf"
        tones={['#6a7eb2', '#9fb0d8']}
        n={5}
        seed={5}
      />
      <Blob cx={33} cy={21} rx={9.4} ry={8.6} fill={coat} tones={['#6f82b4', '#aebbe0']} seed={6} />
      <Blob cx={36.6} cy={23} rx={5.6} ry={5} fill="#fdf6ee" n={3} rim={0.1} seed={7} />
      <Bead x={37.4} y={21.4} r={1.7} />
      <Paint d="M40 23Q47 23 49 26Q44 29.5 40 27Z" bb={[40, 23, 49, 29]} fill="#f6c28f" n={2} rim={0.15} />
      <Blob cx={31} cy={25} rx={2.6} ry={1.5} fill="#f4b6c4" n={2} rim={0} seed={8} />
      <Line d="M26 55L26 58M38 56L38 58" color="#f0b88a" w={3} o={0.95} />
      <Blob cx={26} cy={58.4} rx={4.4} ry={1.7} fill="#f2b98a" n={3} rim={0.1} seed={9} />
      <Blob cx={38.4} cy={58.4} rx={4.4} ry={1.7} fill="#f2b98a" n={3} rim={0.1} seed={10} />
      <Twinkle x={10} y={16} r={2} fill="#e3f0ff" />
      <Twinkle x={56} y={12} r={1.6} fill="#fbe9a8" />
    </>
  );
}

/** A round owl on a blossoming branch. */
function Owl() {
  const wood = '#cda884';
  return (
    <>
      <Wash colors={['#d7e3d8', '#f4dde0', '#c7dde6', '#f9eed2']} seed={81} />
      <Line d="M1 52Q28 49 63 43" color="#8d7a73" w={2.8} o={0.95} />
      <Line d="M48 45Q52 38 58 35M18 51Q14 56 8 57" color="#8d7a73" w={1.4} o={0.9} />
      <Blossom x={58} y={34} r={2.4} seed={2} />
      <Blossom x={52} y={39} r={2} seed={6} />
      <Blossom x={9} y={56} r={2} fill="#f7c8d4" seed={9} />
      <Leaf x={14} y={53} rot={20} s={1} />
      <Blob
        cx={31}
        cy={36}
        rx={13.5}
        ry={17}
        fill={wood}
        tones={['#b88f6e', '#e4c9a8', '#a9a6bf']}
        angle={-75}
        seed={3}
      />
      <Blob cx={31} cy={42} rx={8.4} ry={11} fill="#f6e8d2" tones={['#ecd9bc', '#fbe3e6']} seed={4} />
      <Line
        d="M26 37q2 2 4 0M32 37q2 2 4 0M24 43q2 2 4 0M30 43q2 2 4 0M36 43q2 2 4 0M27 49q2 2 4 0M33 49q2 2 4 0"
        color="#c9ad8c"
        w={0.8}
        o={0.7}
      />
      <Paint
        d="M19 30Q8 40 15 52Q21 45 21 36Z"
        bb={[8, 30, 21, 52]}
        fill="#b88f6e"
        tones={['#a37c5c', '#d4b48e']}
        n={6}
        angle={-70}
        seed={5}
      />
      <Paint
        d="M43 30Q54 40 47 52Q41 45 41 36Z"
        bb={[41, 30, 54, 52]}
        fill="#b88f6e"
        tones={['#a37c5c', '#d4b48e']}
        n={6}
        angle={-110}
        seed={6}
      />
      <Paint d="M21 20L17 10L27 16Z" bb={[17, 10, 27, 20]} fill="#b88f6e" n={2} rim={0.15} />
      <Paint d="M42 20L46 10L36 16Z" bb={[36, 10, 46, 20]} fill="#b88f6e" n={2} rim={0.15} />
      <Blob cx={31} cy={24} rx={12.6} ry={9.8} fill="#d3b08c" tones={['#bd956f', '#ead2b4']} seed={7} />
      <Blob cx={25.2} cy={24} rx={6} ry={5.6} fill="#f6e8d2" n={4} rim={0.12} seed={8} />
      <Blob cx={36.8} cy={24} rx={6} ry={5.6} fill="#f6e8d2" n={4} rim={0.12} seed={9} />
      <Blob cx={25.2} cy={24} rx={3.6} fill="#f6d37e" n={3} rim={0.1} seed={10} />
      <Blob cx={36.8} cy={24} rx={3.6} fill="#f6d37e" n={3} rim={0.1} seed={11} />
      <Bead x={25.4} y={24} r={2} />
      <Bead x={36.6} y={24} r={2} />
      <Paint d="M29 28Q31 26.5 33 28Q31 33 29 28Z" bb={[29, 26, 33, 32]} fill="#f2b27f" n={1} rim={0.1} />
      <Line d="M27 52L26.4 55M30 52.4L30 55.4M34 52L34.4 55M37 51.6L37.8 54.6" color="#e3b88e" w={1.3} o={0.9} />
    </>
  );
}

/** A tiger crouched low, stripes laid on with a loaded brush. */
function Tiger() {
  const gold = '#f4b571';
  const stripe = '#b46a3d';
  return (
    <>
      <Wash
        colors={['#f9e0a9', '#c9e2bf', '#f2c6a6', '#e3efd0']}
        seed={91}
        speckle={['#6fae7a', '#f1c86b', '#ffffff']}
      />
      <Limb d="M44 51Q59 53 58 38" w={4.8} fill={gold} />
      <Line d="M52 51Q53.4 48.4 53 46M57.4 44Q59 42 58.6 40" color={stripe} w={1.4} o={0.7} />
      <Blob
        cx={30}
        cy={47}
        rx={15}
        ry={10.5}
        rot={-6}
        fill={gold}
        tones={['#e99a52', '#fbd29c', '#e8b48a']}
        angle={-10}
        seed={2}
      />
      <Line
        d="M21 40Q23 44 21.5 49M27 38.5Q29.4 43 28 48M33 39Q35.4 43.4 34 48M39 41Q41 44.4 40 49"
        color={stripe}
        w={1.9}
        o={0.65}
      />
      <Blob cx={24} cy={57} rx={5.4} ry={2.8} fill="#fbd29c" n={3} rim={0.12} seed={3} />
      <Blob cx={37} cy={58} rx={5.4} ry={2.6} fill="#fbd29c" n={3} rim={0.12} seed={4} />
      <Blob cx={21} cy={17.5} rx={3.8} fill={gold} n={4} rim={0.15} seed={5} />
      <Blob cx={39} cy={17.5} rx={3.8} fill={gold} n={4} rim={0.15} seed={6} />
      <Blob cx={21} cy={17.8} rx={1.9} fill={CREAM} n={3} rim={0} seed={7} />
      <Blob cx={39} cy={17.8} rx={1.9} fill={CREAM} n={3} rim={0} seed={8} />
      <Blob cx={30} cy={27} rx={11.6} ry={10} fill="#f6b977" tones={['#e99a52', '#fbd7a8', '#e8b48a']} seed={9} />
      <Blob cx={30} cy={31.6} rx={6.8} ry={4.6} fill="#fdf1de" n={4} rim={0.1} seed={10} />
      <Line
        d="M30 17V22M25.6 18Q26.6 21 27.6 22.6M34.4 18Q33.4 21 32.4 22.6M19 26Q22 26.6 23 29M41 26Q38 26.6 37 29"
        color={stripe}
        w={1.3}
        o={0.65}
      />
      <Bead x={24.6} y={26} r={1.9} ring="#a9d4e8" />
      <Bead x={35.4} y={26} r={1.9} ring="#a9d4e8" />
      <Blob cx={30} cy={30} rx={2} ry={1.4} fill="#e98a8e" n={3} rim={0} seed={11} />
      <Line d="M30 31.4Q28.6 33.4 27 32.8M30 31.4Q31.4 33.4 33 32.8" color="#7a5a5a" w={0.6} o={0.6} />
      <Twinkle x={10} y={14} r={2} fill="#fbe9a8" />
    </>
  );
}

/** A pink octopus drifting in blue water, its arms curling. */
function Octopus() {
  const pink = '#f2a5c2';
  return (
    <>
      <Wash
        colors={['#bfe3e8', '#d7e7f6', '#f7d6e0', '#e9f3e0']}
        seed={101}
        speckle={['#ffffff', '#f6c9d4', '#9fd0d8']}
      />
      <Limb d="M21 38Q9 41 11 52Q14 58 20 54" w={5} fill={pink} />
      <Limb d="M26 42Q19 52 23 59" w={5} fill={pink} />
      <Limb d="M32 44Q34 53 31 60" w={5} fill={pink} />
      <Limb d="M38 42Q45 52 41 59" w={5} fill={pink} />
      <Limb d="M43 38Q55 41 53 52Q50 58 44 54" w={5} fill={pink} />
      <Limb d="M17 34Q6 34 5 42" w={3.6} fill="#f6bcd0" />
      <Fleck x={11} y={50} r={0.9} fill="#fbd7e5" />
      <Fleck x={22} y={58} r={0.8} fill="#fbd7e5" />
      <Fleck x={52} y={50} r={0.9} fill="#fbd7e5" />
      <Blob
        cx={32}
        cy={26}
        rx={15.5}
        ry={14.5}
        fill="#f4adc8"
        tones={['#e68fb5', '#fbd0e0', '#c9a9e4']}
        angle={-60}
        seed={2}
      />
      <Bead x={26} y={30} r={2.4} ring="#fff2f6" />
      <Bead x={38.4} y={30} r={2.4} ring="#fff2f6" />
      <Line d="M23 26Q26 24 29 25.6M35.4 25.6Q38.4 24 41.4 26" color="#b86a95" w={0.8} o={0.6} />
      <Line d="M30 35.6Q32.4 37.6 34.8 35.6" color="#a8527e" w={0.8} o={0.7} />
      <Blob cx={20.8} cy={33} rx={2.8} ry={1.6} fill="#fb8fb0" n={2} rim={0} seed={3} />
      <Blob cx={43.6} cy={33} rx={2.8} ry={1.6} fill="#fb8fb0" n={2} rim={0} seed={4} />
      <circle cx={53} cy={10} r={2.8} fill="#e0f1fb" fillOpacity={0.5} stroke="#7aa6c8" strokeWidth={0.5} />
      <circle cx={57} cy={17} r={1.7} fill="#e0f1fb" fillOpacity={0.5} stroke="#7aa6c8" strokeWidth={0.5} />
      <circle cx={9} cy={14} r={2} fill="#e0f1fb" fillOpacity={0.5} stroke="#7aa6c8" strokeWidth={0.5} />
    </>
  );
}

/** A long-necked dino reaching for a flower. */
function Dino() {
  const hide = '#bfaee8';
  return (
    <>
      <Wash colors={['#f9e6b9', '#f4cfd8', '#cfe6dc', '#e2d6f0']} seed={111} />
      <Limb d="M18 49Q8 51 5 58" w={5} fill={hide} />
      <Paint d="M22 43L25 37L28 42Z" bb={[22, 37, 28, 43]} fill="#f6c9a3" n={1} rim={0.1} />
      <Paint d="M29 41L32 34L35 40Z" bb={[29, 34, 35, 41]} fill="#f6c9a3" n={1} rim={0.1} />
      <Limb d="M38 46Q48 43 46 31Q44 22 47 15" w={7} fill={hide} />
      <Blob
        cx={27}
        cy={49}
        rx={14.5}
        ry={9}
        fill={hide}
        tones={['#a493d6', '#e0d6f6', '#e8c5dc']}
        angle={-20}
        seed={2}
      />
      <Blob cx={27} cy={53} rx={9} ry={4.4} fill="#efe8fb" n={4} rim={0.1} seed={3} />
      <Blob cx={19} cy={58} rx={3.8} ry={2.4} fill="#b09fe0" n={3} rim={0.15} seed={4} />
      <Blob cx={35} cy={58} rx={3.8} ry={2.4} fill="#b09fe0" n={3} rim={0.15} seed={5} />
      <Blob cx={50} cy={13} rx={7.4} ry={5.2} rot={-14} fill="#c3b3ea" tones={['#a493d6', '#e0d6f6']} seed={6} />
      <Bead x={52.6} y={11.6} r={1.5} />
      <Line d="M54 15.4Q56 16.2 57.4 15" color="#7a64a8" w={0.7} o={0.7} />
      <Blob cx={46.4} cy={16} rx={2} ry={1.2} fill="#f4b6c8" n={2} rim={0} seed={7} />
      <Blossom x={58} y={5} r={2.4} fill="#f7b8cf" seed={9} />
      <Line d="M58 7.6Q59 12 56 14" color="#7fb98a" w={1.1} o={0.8} />
      <Twinkle x={9} y={20} r={2.2} />
      <Twinkle x={56} y={38} r={1.7} fill="#e3d4f7" />
    </>
  );
}

/** A blue whale afloat in a pastel sky, spout up. */
function Whale() {
  const sea = '#9ac3ec';
  return (
    <>
      <Wash colors={['#f8d3c4', '#cbdff3', '#fbeed2', '#e6cfe4']} seed={121} />
      <Line d="M31 23Q30 16 25 14M31 23Q34 16 39 14" color="#e8f2fc" w={2} o={0.95} />
      <Fleck x={25} y={12.6} r={1.2} fill="#eef6fd" />
      <Fleck x={39.4} y={12.6} r={1.2} fill="#eef6fd" />
      <Fleck x={32} y={11} r={0.9} fill="#eef6fd" />
      <Paint
        d="M47 34Q58 29 61 17Q60 31 54 38Q58 42 59 49Q50 46 46 41Z"
        bb={[46, 17, 61, 49]}
        fill="#8db8e4"
        tones={['#7eaedd', '#bddaf5', '#c4b9e8']}
        n={6}
        seed={2}
      />
      <Blob
        cx={29}
        cy={36}
        rx={22}
        ry={13.5}
        rot={-6}
        fill={sea}
        tones={['#7eaedd', '#bddaf5', '#c4b9e8']}
        angle={-15}
        seed={3}
      />
      <Blob
        cx={27}
        cy={43}
        rx={17}
        ry={6}
        rot={-6}
        fill="#e6f1fb"
        tones={['#d4e6f8', '#fbe8ee']}
        n={5}
        rim={0.1}
        seed={4}
      />
      <Paint d="M26 41Q34 44 38 51Q29 51 25 46Z" bb={[25, 41, 38, 51]} fill="#86b2e0" n={3} rim={0.2} />
      <Bead x={18.6} y={34} r={1.9} />
      <Blob cx={14} cy={39} rx={2.8} ry={1.6} fill="#f4b3c2" n={2} rim={0} seed={5} />
      <Line d="M12 42Q18 46 25 43.4" color="#6a8fc0" w={0.8} o={0.55} />
      <Blob cx={11} cy={55} rx={9.5} ry={3.6} fill="#fdf8fb" tones={['#e8dff0', '#ffffff']} n={4} rim={0.12} seed={6} />
      <Blob cx={31} cy={57} rx={12} ry={3.6} fill="#fdf8fb" tones={['#e8dff0', '#ffffff']} n={4} rim={0.12} seed={7} />
      <Blob cx={51} cy={55} rx={8.6} ry={3.4} fill="#fdf8fb" tones={['#e8dff0', '#ffffff']} n={4} rim={0.12} seed={8} />
      <Twinkle x={9} y={14} r={2.2} />
    </>
  );
}

/** An eastern dragon winding through clouds, pearl in sight. */
function Wyrmling() {
  const coral = '#f2a09b';
  return (
    <>
      <Wash
        colors={['#bfe0dc', '#f7d4b5', '#e9d7ec', '#fbeec9']}
        seed={131}
        speckle={['#f1c86b', '#ffffff', '#6fae9f']}
      />
      <Blob cx={13} cy={57} rx={10} ry={3.6} fill="#fdf8fb" tones={['#dbeaf2', '#ffffff']} n={4} rim={0.12} seed={2} />
      <Blob cx={44} cy={58} rx={13} ry={3.6} fill="#fdf8fb" tones={['#dbeaf2', '#ffffff']} n={4} rim={0.12} seed={3} />
      <Blob cx={51} cy={13} rx={4.6} fill="#fff6dd" tones={['#f3dca0', '#ffffff']} n={4} rim={0.2} seed={4} />
      <Fleck x={49.4} y={11.6} r={1.2} fill="#ffffff" />
      <Limb d="M17 22C34 12 54 25 40 34C26 43 14 45 26 52C31 56 38 53 43 55" w={7.6} fill={coral} />
      <Line d="M20 26C35 18 47 26 37 32" color="#fbe3a8" w={2.4} o={0.9} />
      <Line d="M36 37C26 43 20 45 24 50" color="#fbe3a8" w={2.2} o={0.9} />
      <Paint d="M40 53Q46 47 53 53Q47 58 40 53Z" bb={[40, 47, 53, 58]} fill="#f6c2bd" n={2} rim={0.15} />
      <Paint d="M30 15L34 9L36 17Z" bb={[30, 9, 36, 17]} fill="#8fd3c8" n={1} rim={0.1} />
      <Paint d="M42 22L48 20L45 27Z" bb={[42, 20, 48, 27]} fill="#8fd3c8" n={1} rim={0.1} />
      <Paint d="M18 15Q17 8 21 4Q23 10 22 15Z" bb={[17, 4, 23, 15]} fill="#f6d2a8" n={1} rim={0.1} />
      <Paint d="M24 14Q26 8 30 7Q29 12 27 16Z" bb={[24, 7, 30, 16]} fill="#f6d2a8" n={1} rim={0.1} />
      <Blob
        cx={14}
        cy={22}
        rx={9.4}
        ry={7.6}
        rot={-12}
        fill="#f4a9a4"
        tones={['#e98a85', '#fbc8c0', '#f6d2a8']}
        seed={5}
      />
      <Blob cx={7.4} cy={25} rx={4.4} ry={3} fill="#f8c2bd" n={3} rim={0.1} seed={6} />
      <Bead x={16} y={19.6} r={1.8} ring="#fbe9a8" />
      <Line d="M7 28Q-1 28 0 35M9 29Q3 32 4 37" color="#f6d2a8" w={1.2} o={0.9} />
      <Twinkle x={54} y={30} r={2} />
      <Twinkle x={58} y={46} r={1.5} fill="#e3d4f7" />
    </>
  );
}

/** A fairy perched on a flower bud, wings spread. */
function Fairy() {
  const skin = '#fbd9c6';
  return (
    <>
      <Wash
        colors={['#dccff0', '#c8e8dc', '#f8dce6', '#fbeecb']}
        seed={141}
        speckle={['#ffffff', '#f6dc90', '#b9a8e8']}
      />
      <Blob
        cx={19}
        cy={27}
        rx={10.5}
        ry={6.2}
        rot={-38}
        fill="#bcd8f6"
        tones={['#9fc2ee', '#f0d9f4', '#ffffff']}
        rim={0.3}
        seed={2}
      />
      <Blob
        cx={45}
        cy={27}
        rx={10.5}
        ry={6.2}
        rot={38}
        fill="#bcd8f6"
        tones={['#9fc2ee', '#f0d9f4', '#ffffff']}
        rim={0.3}
        seed={3}
      />
      <Blob
        cx={22}
        cy={38}
        rx={7.6}
        ry={4.4}
        rot={30}
        fill="#cfe2f8"
        tones={['#b2cdf0', '#f6d9e8']}
        rim={0.3}
        seed={4}
      />
      <Blob
        cx={42}
        cy={38}
        rx={7.6}
        ry={4.4}
        rot={-30}
        fill="#cfe2f8"
        tones={['#b2cdf0', '#f6d9e8']}
        rim={0.3}
        seed={5}
      />
      <Line d="M31 33Q22 28 12 22M33 33Q42 28 52 22" color="#9fb8e4" w={0.6} o={0.6} />
      <Blob cx={32} cy={57} rx={11} ry={5.4} fill="#f4b2c8" tones={['#e898b4', '#fbd0e0', '#f6dcb0']} seed={6} />
      <Paint d="M22 56Q20 48 26 49Q26 54 28 58Z" bb={[20, 48, 28, 58]} fill="#f7bfd2" n={3} rim={0.2} />
      <Paint d="M42 56Q44 48 38 49Q38 54 36 58Z" bb={[36, 48, 44, 58]} fill="#f7bfd2" n={3} rim={0.2} />
      <Limb d="M29 46Q27 51 26 54" w={2.4} fill={skin} />
      <Limb d="M35 46Q37 51 38 54" w={2.4} fill={skin} />
      <Paint
        d="M26 31L38 31L42 47Q32 51 22 47Z"
        bb={[22, 31, 42, 51]}
        fill="#b6e6cf"
        tones={['#9fd8c0', '#e0f6ec', '#f0d6ec']}
        n={7}
        angle={-80}
        seed={7}
      />
      <Limb d="M26 35Q20 38 19 33" w={2.2} fill={skin} />
      <Limb d="M38 35Q44 36 47 30" w={2.2} fill={skin} />
      <Line d="M47 30L52 21" color="#c9a979" w={1} o={0.9} />
      <Twinkle x={52.6} y={18.6} r={3.2} fill="#fbe08a" />
      <Blob cx={32} cy={23} rx={6.4} fill={skin} tones={['#f6c4ae', '#fff0e6']} n={5} seed={8} />
      <Blob
        cx={32}
        cy={18.6}
        rx={7.4}
        ry={5.4}
        fill="#c9a6ee"
        tones={['#b08ae0', '#e2c9f6']}
        n={6}
        rim={0.2}
        seed={9}
      />
      <Blob cx={32} cy={11.6} rx={3.4} fill="#c9a6ee" n={3} rim={0.2} seed={10} />
      <Bead x={29.8} y={23.4} r={1.05} />
      <Bead x={34.2} y={23.4} r={1.05} />
      <Blob cx={27.8} cy={26} rx={1.6} ry={1} fill="#f6a0b8" n={2} rim={0} seed={11} />
      <Blob cx={36.2} cy={26} rx={1.6} ry={1} fill="#f6a0b8" n={2} rim={0} seed={12} />
      <Twinkle x={10} y={30} r={2} fill="#f7b8d8" />
      <Twinkle x={56} y={8} r={1.6} fill="#e3d4f7" />
      <Twinkle x={9} y={8} r={1.6} />
    </>
  );
}

/** A cat of the void, sitting on a crescent moon, its coat full of stars. */
function VoidCat() {
  const coat = '#6f63a8';
  return (
    <>
      <Wash
        colors={['#3f3a78', '#6a5aa8', '#e7a8c8', '#2c2a5a']}
        seed={151}
        speckle={['#ffffff', '#f6dc90', '#bff0d8']}
      />
      <Paint
        d="M6 50Q30 66 58 46Q38 56 6 50Z"
        bb={[6, 46, 58, 60]}
        fill="#f6ecc8"
        tones={['#f1d9a0', '#ffffff']}
        n={4}
        rim={0.2}
        seed={2}
      />
      <Limb d="M22 52Q8 52 9 39Q10 31 16 33" w={5} fill="#7b6fb6" />
      <Twinkle x={16} y={31} r={3} fill="#bff0d8" />
      <Blob
        cx={30}
        cy={43}
        rx={11}
        ry={13}
        rot={12}
        fill={coat}
        tones={['#4e4488', '#9a8fd0', '#d49ac8']}
        angle={-50}
        seed={3}
      />
      <Blob cx={36} cy={41} rx={5} ry={8} fill="#8f84c6" n={4} rim={0.12} seed={4} />
      <Paint d="M30 20Q29 11 33 9Q38 12 39 18Z" bb={[29, 9, 39, 20]} fill={coat} n={3} rim={0.2} />
      <Paint d="M43 17Q47 10 51 10Q51 18 48 23Z" bb={[43, 10, 51, 23]} fill={coat} n={3} rim={0.2} />
      <Blob cx={39} cy={26} rx={10.5} ry={9.4} fill="#7468b0" tones={['#5a4f96', '#a99fdc', '#d49ac8']} seed={5} />
      <Blob cx={45.6} cy={30} rx={4.4} ry={3.2} fill="#9a8fd0" n={3} rim={0.1} seed={6} />
      <Blob cx={43} cy={25} rx={3.2} ry={3.6} fill="#bff5da" n={3} rim={0} seed={7} />
      <Blob cx={34.4} cy={25.6} rx={2.6} ry={3} fill="#bff5da" n={3} rim={0} seed={8} />
      <Fleck x={43.4} y={25} r={1.3} fill={INK} o={0.9} />
      <Fleck x={34.6} y={25.6} r={1.1} fill={INK} o={0.9} />
      <Fleck x={48.4} y={29.4} r={1} fill="#f7a0c0" o={1} />
      <Line d="M47 31Q53 30 58 31.5" color="#d9cef6" w={0.5} o={0.6} />
      <Fleck x={26} y={40} r={0.8} fill="#ffffff" />
      <Fleck x={33} y={47} r={0.7} fill="#ffffff" />
      <Fleck x={24} y={50} r={0.9} fill="#ffffff" />
      <Fleck x={38} y={52} r={0.7} fill="#ffffff" />
      <Fleck x={30} y={35} r={0.6} fill="#ffffff" />
      <Fleck x={41} y={20} r={0.6} fill="#ffffff" />
      <Line d="M36 53L35 57M30 54L29 57" color="#4e4488" w={2.6} o={0.8} />
      <Twinkle x={9} y={12} r={2.4} fill="#e9dcff" />
      <Twinkle x={56} y={42} r={1.8} fill="#bff0d8" />
    </>
  );
}

/* ─── registry ───────────────────────────────────────────────────────────── */

const ART: Readonly<Record<string, () => ReactNode>> = {
  'pet.cat': Cat,
  'pet.dragon': BabyDragon,
  'pet.ghost': Ghost,
  'pet.robot': Robot,
  'pet.x.fox': Fox,
  'pet.x.panda': Panda,
  'pet.x.penguin': Penguin,
  'pet.x.owl': Owl,
  'pet.x.tiger': Tiger,
  'pet.x.octopus': Octopus,
  'pet.x.dino': Dino,
  'pet.x.whale': Whale,
  'pet.x.dragon2': Wyrmling,
  'pet.x.fairy': Fairy,
  'pet.x.void-cat': VoidCat,
};

/** Every pet id that has an illustration. */
export const PET_ART_IDS: readonly string[] = Object.keys(ART);

export function hasPetArt(id: string | undefined | null): boolean {
  return id != null && Object.prototype.hasOwnProperty.call(ART, id);
}

export function PetArt({
  id,
  size,
  className,
  title,
}: {
  id: string;
  size: number;
  className?: string;
  title?: string;
}): ReactElement | null {
  // The pet id is part of the prefix too, so two React roots (whose `useId` sequences both start at the
  // beginning) can only ever share an id between two copies of the same pet, which draw identically.
  const prefix = `pet-${id.replace(/[^a-zA-Z0-9]/g, '')}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const draw = hasPetArt(id) ? ART[id] : undefined;
  if (!draw) return null;
  return (
    <svg
      viewBox={ART_VIEWBOX}
      width={size}
      height={size}
      className={className}
      overflow="visible"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <PaintFilter id={`${prefix}-paint`} seed={4} />
        <SoftFilter id={`${prefix}-soft`} />
      </defs>
      <PaintCtx.Provider value={prefix}>
        <g filter={`url(#${prefix}-paint)`}>{draw()}</g>
      </PaintCtx.Provider>
    </svg>
  );
}
