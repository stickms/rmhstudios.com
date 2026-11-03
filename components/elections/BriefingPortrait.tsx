import { useRef, useState } from 'react';
import { m as motion, useScroll, useTransform } from 'framer-motion';

/**
 * A black-and-white cut-out portrait of the Briefing Room host, drifting with the scroll.
 *
 * The images are NOT in the repo: drop licensed, transparent-background PNGs at
 * `public/elections/briefer-1.png`, `briefer-2.png`, … (one per `variant`). Until a file exists the
 * component renders nothing, so no page ever shows a broken image. Alt text is a role, not a name — add
 * attribution only once the person has agreed to it.
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
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [drift, -drift]);
  if (missing) return null;
  return (
    <motion.div ref={ref} className={`el-portrait ${className ?? ''}`} style={{ y }} aria-hidden={alt === ''}>
      <img
        src={`/elections/briefer-${variant}.png`}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setMissing(true)}
      />
    </motion.div>
  );
}
