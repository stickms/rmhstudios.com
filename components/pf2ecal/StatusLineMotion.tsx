// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it (eslint `no-restricted-imports`).
import {
  AnimatePresence,
  m as motion,
} from 'framer-motion';
import { EASE } from './motion';

/**
 * The animated half of `StatusLine` (./Loading.tsx): each message fades in from
 * above and out below, one at a time. It is its own module because
 * `BoardPending` is the route's `pendingComponent`, which the router imports
 * with the route tree: with this inline, framer-motion's `m` and
 * `AnimatePresence` were on the critical path of every page of the site
 * (third-pass audit RT1).
 */
export function StatusLineMotion({
  message,
}: {
  message:
    | string
    | null;
}) {
  return (
    <AnimatePresence mode="wait">
      {message && (
        <motion.p
          key={
            message
          }
          className="pf2e-caption"
          initial={{
            opacity: 0,
            y: -3,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            y: 3,
          }}
          transition={{
            duration: 0.18,
            ease: EASE,
          }}
        >
          {
            message
          }
        </motion.p>
      )}
    </AnimatePresence>
  );
}
