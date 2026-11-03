import { useEffect, useRef, useState } from 'react';
import { m as motion, useScroll, useTransform } from 'framer-motion';

/**
 * A black-and-white cut-out portrait of the Briefing Room host, drifting with the scroll. The files are
 * real transparent WebPs at `public/elections/briefer-<variant>.webp` (background removed from the
 * supplied photos). If one is ever missing the component renders nothing rather than a broken image.
 * Alt text is a role, not a name — add attribution only once the person has agreed to it.
 */
export function BriefingPortrait({
  variant = 1,
  alt = '',
  className,
  drift = 60,
}: {
  variant?: number;
  alt?: string;
  className?: string;
  /** How far (px) the portrait travels against the scroll. */
  drift?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [missing, setMissing] = useState(false);
  // Client-only: the scroll-driven transform has no server value, so rendering it in the SSR HTML would mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);
  if (missing) return null;
  return (
    <div ref={ref} className={`el-portrait ${className ?? ''}`} aria-hidden={alt === ''}>
      {mounted ? (
        <motion.div style={{ y }}>
          <img
            src={`/elections/briefer-${variant}.webp`}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setMissing(true)}
          />
        </motion.div>
      ) : null}
    </div>
  );
}
