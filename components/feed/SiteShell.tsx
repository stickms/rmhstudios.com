'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackToTop } from '@/components/ui/back-to-top';
import { LeftSidebar } from './LeftSidebar';
import { MobileSidebarShell } from './MobileSidebarShell';
import { ShellLayoutContext } from './shell-context';
import { usePointerParallax, useScrollParallax } from '@/hooks/useParallax';
import { m as motion, type MotionValue } from 'framer-motion';

interface SiteShellProps {
  children: ReactNode;
  /** Global dialogs/notices that must share the shell's floating-stack context. */
  overlays?: ReactNode;
}

/**
 * Responsive chrome for every standard website route.
 * Features global parallax (pointer + scroll) with GPU-accelerated transforms.
 */
export function SiteShell({ children, overlays }: SiteShellProps) {
  const { t } = useTranslation('common');
  const { t: tf } = useTranslation('feed');
  const pointer = usePointerParallax(12);
  const scrollY1 = useScrollParallax({ distance: 80, direction: 'up' });
  const scrollY2 = useScrollParallax({ distance: 40, direction: 'down' });

  return (
    <ShellLayoutContext.Provider value>
      <div className="vibe-app site-shell relative overflow-x-hidden">
        {/* Global Parallax Background — pointer + scroll driven organic shapes */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
          style={{ willChange: 'transform' }}
        >
          {/* Top-right blob: pointer + scroll parallax */}
          <motion.div
            className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-site-text/[0.03]"
            style={{
              y: scrollY1 as MotionValue<number>,
              x: pointer.x * 1.2,
              willChange: 'transform',
            }}
          />
          {/* Bottom-left blob: inverse pointer + opposite scroll */}
          <motion.div
            className="absolute -left-40 bottom-1/4 h-[22rem] w-[22rem] rounded-full bg-site-text/[0.025]"
            style={{
              y: scrollY2 as MotionValue<number>,
              x: -pointer.x * 0.8,
              willChange: 'transform',
            }}
          />
          {/* Center-right subtle accent dot */}
          <motion.div
            className="absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-site-accent/[0.02]"
            style={{
              x: pointer.x * 0.5,
              y: typeof scrollY1 === 'number' ? 0 : scrollY1,
              willChange: 'transform',
            }}
          />
        </div>

        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[var(--site-control-radius)] focus:bg-site-accent focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:text-site-accent-fg"
        >
          {t('skipToContent', { defaultValue: 'Skip to content' })}
        </a>

        <div className="site-shell__rail-slot relative z-10">
          <aside
            className="site-shell__rail"
            aria-label={tf('open-menu', { defaultValue: 'Navigation menu' })}
          >
            <div className="site-shell__rail-glass glass-chrome--aside">
              <LeftSidebar />
            </div>
          </aside>
        </div>

        <MobileSidebarShell>
          <main
            id="main-content"
            tabIndex={-1}
            className="site-shell__main page-root focus:outline-none relative z-10"
          >
            {children}
          </main>
        </MobileSidebarShell>

        {overlays}
        <BackToTop />
      </div>
    </ShellLayoutContext.Provider>
  );
}
