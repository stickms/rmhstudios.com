import { m as motion } from 'framer-motion';
import { SPRING } from '@/lib/app-motion';

/**
 * The app tier's active-tab thumb: one framer-motion `layoutId` capsule that morphs
 * between tabs (components/ui/tabs.tsx, L8). The outer element owns the layoutId
 * projection (the position morph); the inner span carries the material, so scaling
 * never fights framer-motion's projection transform. The material (`--tab-thumb-*`)
 * lives in globals.css so themes and games re-skin it with two custom properties.
 *
 * Its own module, loaded lazily by `Tabs`, because only the full-screen games and
 * apps draw it: as a static import of tabs.tsx it put framer-motion's `m` and its
 * layout projection on every site page that has a tab strip, the home feed
 * included, where Steel draws a rule and never this capsule.
 */
export default function TabCapsule({
  layoutId,
}: {
  layoutId: string;
}) {
  return (
    <motion.span
      layoutId={
        layoutId
      }
      aria-hidden
      // The hook globals.css uses to decide whether the thumb ink is safe.
      data-tab-capsule=""
      className="absolute inset-0"
      transition={
        SPRING.snappy
      }
    >
      <TabThumb />
    </motion.span>
  );
}

/** The material alone. tabs.tsx draws the same markup as its loading fallback. */
export function TabThumb() {
  return (
    <span
      data-tab-thumb=""
      className="absolute inset-0 rounded-[var(--tab-radius,var(--site-control-radius))]"
    />
  );
}
