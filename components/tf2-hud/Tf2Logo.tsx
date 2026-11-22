/**
 * The Team Fortress 2 logo: a static WebP cut from the game's own material
 * (`materials/logo/tf2_logo.vtf`, cropped to its opaque pixels).
 *
 * It used to be decoded from the VTF in the browser on every visit, which held the
 * hero on a text placeholder until the texture arrived and then jumped. The logo never
 * changes, so it ships as a 15 KB image whose size is declared up front — the slot is
 * reserved before it loads. Size it by height (e.g. `h-24`); the width follows.
 */
import { cn } from '@/lib/utils';

const LOGO_SRC = '/tf2-hud/tf2-logo.webp';
const LOGO_WIDTH = 500;
const LOGO_HEIGHT = 109;

export default function Tf2Logo({ className, label }: { className?: string; label: string }) {
  return (
    <img
      src={LOGO_SRC}
      width={LOGO_WIDTH}
      height={LOGO_HEIGHT}
      alt={label}
      decoding="async"
      fetchPriority="high"
      // Preflight makes an <img> a block, so it is centred with margins, not `text-center`.
      className={cn('mx-auto w-auto max-w-full object-contain', className)}
    />
  );
}
