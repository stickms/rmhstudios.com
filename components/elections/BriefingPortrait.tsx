import { useEffect, useRef, useState } from 'react';
import { m as motion, useScroll, useTransform } from 'framer-motion';

/**
 * A black-and-white cut-out portrait of the Briefing Room host, drifting with the scroll. The files are
 * real transparent WebPs at `public/elections/briefer-<variant>.webp` (background removed from the
 * supplied photos). If one is ever missing the component renders nothing rather than a broken image.
 * The host is named with his agreement; the summaries beside him are still generated automatically, and
 * the page says so — the caption names the host, it does not claim he wrote the text.
 */
export const HOST_NAME = 'John Kiriakou';

export function BriefingPortrait({
  variant = 1,
  alt = HOST_NAME,
  caption,
  flip = false,
  className,
  drift = 60,
}: {
  variant?: number;
  alt?: string;
  /** A small name tag under the portrait. */
  caption?: string;
  /** Mirror the photo so he faces the other way (he should face the content he sits beside). */
  flip?: boolean;
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
    <div ref={ref} className={`el-portrait ${className ?? ''}`}>
      {mounted ? (
        <motion.div style={{ y }}>
          <img
            src={`/elections/briefer-${variant}.webp`}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            data-flip={flip || undefined}
            onError={() => setMissing(true)}
          />
          {caption ? <span className="el-portrait__tag">{caption}</span> : null}
        </motion.div>
      ) : null}
    </div>
  );
}
