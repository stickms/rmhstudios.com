'use client';

import type { ReactNode } from'react';
import { useTranslation } from'react-i18next';
import { BackToTop } from'@/components/ui/back-to-top';
import { LeftSidebar } from'./LeftSidebar';
import { MobileSidebarShell } from'./MobileSidebarShell';
import { ShellLayoutContext } from'./shell-context';
import { usePointerParallax } from'@/hooks/useParallax';
import { motion } from'framer-motion';

interface SiteShellProps {
 children: ReactNode;
 /** Global dialogs/notices that must share the shell's floating-stack context. */
 overlays?: ReactNode;
}

/**
 * Responsive chrome for every standard website route.
 * Rebuilt for the Ultra Minimalist IPO Redesign with subtle organic shapes
 * and dynamic background parallax movement.
 */
export function SiteShell({ children, overlays }: SiteShellProps) {
 const { t } = useTranslation('common');
 const { t: tf } = useTranslation('feed');
 const parallax = usePointerParallax(20);

 return (
 <ShellLayoutContext.Provider value>
 <div className="vibe-app site-shell relative overflow-x-hidden">
 {/* Background Organic Floating Blob Shapes with Pointer Parallax */}
 <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-40">
 <motion.div
 className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-site-text/5 blur-3xl"
 animate={{
 x: parallax.x * 1.5,
 y: parallax.y * 1.5,
 }}
 transition={{ type:'spring', stiffness: 50, damping: 20 }}
 />
 <motion.div
 className="absolute -left-32 top-1/2 h-[30rem] w-[30rem] rounded-full bg-site-text/4 blur-3xl"
 animate={{
 x: -parallax.x * 2,
 y: -parallax.y * 2,
 }}
 transition={{ type:'spring', stiffness: 40, damping: 25 }}
 />
 </div>

 <a
 href="#main-content"
 className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-site-accent focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:uppercase focus:text-site-accent-fg"
 >
 {t('skipToContent', { defaultValue:'Skip to content'})}
 </a>

 <div className="site-shell__rail-slot relative z-10">
 <aside
 className="site-shell__rail"
 aria-label={tf('open-menu', { defaultValue:'Navigation menu'})}
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
