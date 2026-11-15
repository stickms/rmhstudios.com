import { cn } from '@/lib/utils';
import { RadialLoader } from '@/components/ui/radial-loader';

interface SpinnerProps {
  /** Pixel size of the spinner (default 24). */
  size?: number;
  className?: string;
  label?: string;
}

/**
 * Canonical loading spinner (Steel M6: one plain spinner). Replaces the ad-hoc
 * `<Loader2 className="h-6 w-6 animate-spin text-site-accent" />` repeated across feed components so size and colour
 * stay consistent. It renders `RadialLoader`, a ring in the ink colour.
 */
export function Spinner({
  size = 24,
  className,
  label,
}: SpinnerProps) {
  return (
    <RadialLoader
      size={
        size
      }
      label={
        label ??
        'Loading'
      }
      className={cn(
        'text-site-accent',
        className,
      )}
    />
  );
}
