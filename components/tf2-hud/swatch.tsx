/**
 * A colour chip over a checkerboard, so transparency is visible.
 */
import { rgbaCss, type Rgba } from '@/lib/tf2-hud/scheme/scheme';
import { cn } from '@/lib/utils';

export function Swatch({ color, className }: { color?: Rgba; className?: string }) {
  return (
    <span
      className={cn(
        'relative block overflow-hidden rounded-(--app-radius-sm) border border-(--app-border-bright)',
        className,
      )}
      aria-hidden
    >
      <span className="tf2hud-checker absolute inset-0" />
      <span
        className="absolute inset-0"
        style={{ background: color ? rgbaCss(color) : 'transparent' }}
      />
    </span>
  );
}
