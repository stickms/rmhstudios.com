'use client';

/**
 * The page's one modal surface: a bottom sheet on a phone, a centred card on a
 * desktop (the switch is pure CSS — see `pf2ecal.css`).
 *
 * Built on Radix Dialog rather than a hand-rolled overlay so the parts that are
 * tedious and easy to get subtly wrong are not re-derived here: focus is
 * trapped and restored to the trigger on close, Escape closes, the rest of the
 * document is `aria-hidden` and inert to a screen reader, and the body stops
 * scrolling behind the sheet.
 *
 * **The token detail that matters:** Radix portals its content to `<body>`,
 * which is outside the page's `.pf2e` root. Custom properties are inherited, so
 * every `var(--pf2e-*)` inside the sheet would resolve to nothing — and an
 * unresolved `var()` invalidates the whole declaration, meaning `padding` and
 * `background-color` would not be "close", they would be absent. So the portal
 * content re-declares `.pf2e` on itself. This is the same failure
 * `lib/__tests__/portal-token-scope.test.ts` exists to catch in `radial.css`.
 */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SPRING_PANEL, TRANSITION_FAST } from './motion';

/**
 * Motion for the sheet. Two shapes, because the sheet has two forms: the phone
 * sheet rises from the bottom edge, the desktop card scales up in place.
 * `prefers-reduced-motion` is honoured globally by the `MotionConfig` in
 * `components/Providers.tsx`, so there is no branch for it here.
 */
const SCRIM = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const SHEET = {
  initial: { y: '100%', opacity: 1 },
  animate: { y: 0, opacity: 1 },
  exit: { y: '100%', opacity: 1 },
};

/** A spring, not a duration: the sheet is a surface being thrown, not a fade. */

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Rendered under the title in the sticky header. */
  subtitle?: string;
  /** Buttons pinned to the header's trailing edge, beside the close control. */
  headerAction?: ReactNode;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, title, subtitle, headerAction, children }: SheetProps) {
  const { t } = useTranslation('r-pf2ecal');
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            {/* `.pf2e` here is what keeps the design tokens resolvable outside
                the page root — see the module note. */}
            <div className="pf2e">
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  className="pf2e-scrim"
                  variants={SCRIM}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={TRANSITION_FAST}
                />
              </DialogPrimitive.Overlay>

              <div className="pf2e-sheet-wrap">
                <DialogPrimitive.Content asChild forceMount>
                  <motion.div
                    className="pf2e-sheet"
                    variants={SHEET}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={SPRING_PANEL}
                  >
                    <div className="pf2e-grabber" aria-hidden />

                    <div className="pf2e-sheet-head">
                      <div className="min-w-0">
                        <DialogPrimitive.Title className="pf2e-title truncate">
                          {title}
                        </DialogPrimitive.Title>
                        {subtitle ? (
                          <DialogPrimitive.Description className="pf2e-caption truncate">
                            {subtitle}
                          </DialogPrimitive.Description>
                        ) : (
                          // Radix warns when a dialog has no description; an
                          // explicitly-empty visually-hidden one is the
                          // sanctioned way to say "there isn't one".
                          <DialogPrimitive.Description className="pf2e-sr-only">
                            {title}
                          </DialogPrimitive.Description>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {headerAction}
                        <DialogPrimitive.Close asChild>
                          <button
                            type="button"
                            className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
                            aria-label={t('close', { defaultValue: 'Close' })}
                          >
                            <X size={18} aria-hidden />
                          </button>
                        </DialogPrimitive.Close>
                      </div>
                    </div>

                    <div className="px-5 py-4">{children}</div>
                  </motion.div>
                </DialogPrimitive.Content>
              </div>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
