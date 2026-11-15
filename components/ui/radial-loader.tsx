interface RadialLoaderProps {
  /** Pixel size of the loader box (default 24). */
  size?: number;
  className?: string;
  /** Accessible label; omit only when a parent already announces the wait. */
  label?: string;
  /** Drop `role="status"` when an ancestor already owns the live region. */
  decorative?: boolean;
}

/**
 * The site's one loading mark (Steel M6): a plain ring with one ink quarter turning. It is a response to a wait, shown
 * only while something loads, and it stops being drawn when the wait ends. Colour is `currentColor`, so it inherits
 * whatever context it lands in. `prefers-reduced-motion` holds the ring still (the ring itself still reads as busy).
 *
 * The file keeps its name because `Spinner` and a dozen call sites import `RadialLoader`; there is no radial loader any
 * more.
 */
export function RadialLoader({ size = 24, className, label, decorative }: RadialLoaderProps) {
  return (
    <span
      // A plain join, not cn(): tailwind-merge would ride into every island via GameLoadingFallback.
      className={`inline-block shrink-0 align-middle animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent opacity-80${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : (label ?? 'Loading')}
      aria-hidden={decorative || undefined}
    />
  );
}
