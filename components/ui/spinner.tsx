import { cn } from '@/lib/utils';
import { RadialLoader } from '@/components/ui/radial-loader';

interface SpinnerProps {
  /** Pixel size of the spinner (default 24). */
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Canonical loading spinner. Replaces the ad-hoc
 * `<Loader2 className="h-6 w-6 animate-spin text-site-accent" />` repeated
 * across 40+ feed components so size/colour stay consistent.
 *
 * It renders the site's radial loading mark (`RadialLoader`) rather than a
 * generic rotating spinner, so every wait speaks the same language as the hub:
 * blobs orbiting a pulsing core, fused into one liquid body by the goo filter
 * inside the radial shell. The props are unchanged and the mark still paints in
 * the accent, so all existing call sites pick it up untouched.
 */
export function Spinner({ size = 24, className, label }: SpinnerProps) {
  return (
    <RadialLoader
      size={size}
      label={label ?? 'Loading'}
      className={cn('text-site-accent', className)}
    />
  );
}
