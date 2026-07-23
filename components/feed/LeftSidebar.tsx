'use client';

import { Link, useLocation, useNavigate } from'@tanstack/react-router';
import { useState, useEffect, useRef, useId } from'react';
import { authClient } from'@/lib/auth-client';
import { UserAvatar } from'@/components/ui/UserAvatar';
import { useSession, useResolvedUser } from'@/components/Providers';
import {
 LogOut,
 User,
 MoreHorizontal,
 Pin,
 Settings,
 Bookmark,
 Zap,
 ChevronDown,
 HelpCircle,
} from'lucide-react';
import { useTranslation } from'react-i18next';
import { Button } from'@/components/ui/button';
import { NotificationsPopover } from'@/components/site/NotificationsPopover';
import { NotificationBadge } from'@/components/ui/notification-badge';
import { useUnreadCount } from'@/lib/useUnreadCount';
import { useNavStore } from'@/stores/navStore';
import { useLayoutStore } from'@/stores/layoutStore';
import { SIDEBAR_NAV, isNavGroup, orderNavItems, type NavLeaf } from'@/lib/sidebar-nav';
import { useNotificationCount } from'@/lib/useNotificationCount';
import { useAdminReviewCount } from'@/lib/useAdminReviewCount';
import { MobileSidebarCloseButton } from'./MobileSidebarCloseButton';
import { useAppBadge } from'@/lib/useAppBadge';
import { useStreak } from'@/lib/useStreak';
import { usePresenceHeartbeat } from'@/lib/usePresenceHeartbeat';
import { AnimatePresence, m as motion } from'framer-motion';
import { SPRING } from'@/lib/motion';
import { useReducedMotion } from'@/hooks/useReducedMotion';
import { useLiquidMorph } from'@/components/ui/liquid-morph';
import { useLiquidPop } from'@/components/ui/liquid-pop';

// Dropdown motion for collapsible nav groups (e.g."More"): the panel expands
// its height while its items fade/slide in with a slight stagger.
const SUBMENU_PANEL = {
 open: { height:'auto'as const, opacity: 1 },
 closed: { height: 0, opacity: 0 },
};
const SUBMENU_LIST = {
 open: { transition: { staggerChildren: 0.04, delayChildren: 0.03 } },
 closed: {},
};
const SUBMENU_ITEM = {
 open: { opacity: 1, y: 0, transition: { duration: 0.18 } },
 closed: { opacity: 0, y: -6 },
};

type SidebarSessionUser = {
 id: string;
 handle?: string | null;
 isAdmin?: boolean;
};

export function LeftSidebar({ expanded = false }: { expanded?: boolean }) {
 // When expanded=true (e.g. in mobile drawer), always show labels.
 // Otherwise, labels stay hidden on the tablet rail and appear at the ordinary
 // desktop breakpoint, where the shell expands to a readable 216px sidebar.
 const labelClass = expanded ?'':'hidden lg:block';
 const logoFullClass = expanded ?'':'hidden lg:block';
 const logoShortClass = expanded ?'hidden':'lg:hidden';
 // Mobile drawer (`expanded`): pad x/top uniformly; the bottom inset is applied
 // inline (see the root div) as 1rem + the OS safe-area, so the sidebar body
 // fills the drawer to the bottom with no empty tinted band while the footer
 // still clears the home indicator once Safari's bottom bar collapses (env() is
 // 0 while that bar is shown).
 // Collapsed rail (md, 64px): tighter padding so the icon pills breathe inside
 // the m-2 rail panel instead of being crushed + clipped (§5.5x A.3). p-4 returns
 // at lg where the rail expands and shows labels.
 const paddingClass = expanded ?'px-3 pt-3':'p-1 lg:p-3';
 const logoAlignClass = expanded ?'justify-start':'justify-center lg:justify-start';
 const iconMrClass = expanded ?'mr-2':'lg:mr-2';
 const itemJustifyClass = expanded ?'':'md:justify-center lg:justify-start';
 // Collapsed pills drop to px-2 at md (icon-only) so a ~40px rounded pill centres
 // the icon without overflowing the tight rail track; px-3.5 returns at lg with
 // labels (§5.5x A.3). Expanded (drawer) always keeps the roomy px-3.5.
 const itemPadXClass = expanded ?'px-3.5':'px-2 lg:px-3.5';
 // Both the mobile drawer (MobileSidebarShell's fixed `<aside>`) and the desktop
 // rail fill the viewport height, so the nav
 // gets its own internal scroll region while the footer (notification bell,
 // profile/sign-in) stays pinned to the bottom. `overscroll-contain`keeps a
 // scroll that reaches the nav's top/bottom from chaining out to the main page
 // (which scrolls the window) — on desktop as well as mobile. Mobile adds
 // `touch-pan-y`so a swipe scrolls only the nav and never triggers a back-nav
 // gesture.
 const rootSizeClass ='h-full min-h-0';
 const navScrollClass = expanded
 ?'flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y'
 :'flex-1 min-h-0 overflow-y-auto overscroll-contain';
 const { t } = useTranslation('feed');
 const { pathname } = useLocation();
 const navigate = useNavigate();
 const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
 const init: Record<string, boolean> = {};
 for (const item of SIDEBAR_NAV) {
 if (isNavGroup(item))
 init[item.group] = item.children.some((c) => pathname?.startsWith(c.href));
 }
 return init;
 });
 const toggleGroup = (g: string) => setOpenGroups((s) => ({ ...s, [g]: !s[g] }));
 const reduced = useReducedMotion();

 // §5.47: the active-nav capsule FLOWS between items on route change — a
 // layoutId pill that morphs vertically, with velocity squash/stretch and a
 // gooey trailing droplet (useLiquidMorph). Both LeftSidebar instances (desktop
 // rail + mobile drawer) are mounted at once, so the layoutId is useId-scoped so
 // their capsules never share one element. The capsule renders inside whichever
 // active leaf `canHost`s it (deduped so a pinned + submenu duplicate never
 // mounts two elements with the same layoutId).
 const capsuleUid = useId();
 const capsuleLayoutId = `rmh-sidebar-capsule-${capsuleUid}`;
 const capsuleRef = useRef<HTMLSpanElement>(null);
 const { squashStyle, underlay: capsuleUnderlay } = useLiquidMorph({
 capsuleRef,
 axis:'y',
 reduced,
 activeKey: pathname,
 });
 const [showUserMenu, setShowUserMenu] = useState(false);
 const userMenuRef = useRef<HTMLDivElement>(null);
 const userMenuBtnRef = useRef<HTMLButtonElement>(null);
 const userMenuPopRef = useRef<HTMLDivElement>(null);
 const [userMenuPos, setUserMenuPos] = useState({ bottom: 0, right: 0 });
 // The click handler positions the menu from a hardcoded size estimate; this
 // clamps the actually-rendered element so a taller/narrower menu (or a small
 // viewport) can't still push it off-screen. Re-fit when the anchor moves.
 // §15.6 liquid pop — the user menu buds out of the"more options"trigger.
 const { underlay: userMenuUnderlay } = useLiquidPop({
 triggerRef: userMenuBtnRef,
 panelRef: userMenuPopRef,
 open: showUserMenu,
 });
 const rootRef = useRef<HTMLDivElement>(null);
 const navRef = useRef<HTMLElement>(null);

 // Stop a wheel/trackpad scroll over the sidebar from scrolling the main page
 // behind it. `overscroll-contain`only prevents *chaining* once the nav is a
 // scroll container that reaches its edge — when the nav content fits (nothing
 // to scroll) the browser scrolls the document instead. So when the nav can't
 // absorb the delta (not scrollable, or already at that edge) we preventDefault.
 useEffect(() => {
 const rootEl = rootRef.current;
 if (!rootEl) return;
 function onWheel(e: WheelEvent) {
 const nav = navRef.current;
 if (!nav) return;
 const overNav = e.target instanceof Node && nav.contains(e.target);
 const canScroll = nav.scrollHeight > nav.clientHeight + 1;
 const atTop = nav.scrollTop <= 0;
 const atBottom = nav.scrollTop >= nav.scrollHeight - nav.clientHeight - 1;
 // Let the wheel through only when it's over the nav and the nav can still
 // scroll that way; otherwise it would fall through to the page, so cancel it.
 const navAbsorbs =
 overNav && canScroll && !(e.deltaY > 0 ? atBottom : e.deltaY < 0 ? atTop : true);
 if (!navAbsorbs && e.cancelable) e.preventDefault();
 }
 rootEl.addEventListener('wheel', onWheel, { passive: false });
 return () => rootEl.removeEventListener('wheel', onWheel);
 }, []);

 // Pinned"More"destinations (persisted per device). Hydrated after mount so
 // the SSR markup — which can't know this device's pins — never mismatches.
 const pinned = useNavStore((s) => s.pinned);
 const navHydrated = useNavStore((s) => s.hydrated);
 const togglePin = useNavStore((s) => s.togglePin);
 useEffect(() => {
 useNavStore.getState().hydrate();
 }, []);

 // User-customized top-level tab order + hidden tabs (cross-device, §15). Same
 // deal: the store starts at the defaults (empty order / nothing hidden), which
 // match the SSR markup, and hydrate() applies the saved layout after mount so
 // there's never a hydration mismatch.
 const sidebarOrder = useLayoutStore((s) => s.sidebar.order);
 const sidebarHidden = useLayoutStore((s) => s.sidebar.hidden);
 const layoutHydrated = useLayoutStore((s) => s.hydrated);
 useEffect(() => {
 useLayoutStore.getState().hydrate();
 }, []);
 // Apply the saved order, then drop hidden leaves. Both fall back to defaults
 // until hydrated, so the first client render matches the server's.
 const orderedNav = orderNavItems(SIDEBAR_NAV, layoutHydrated ? sidebarOrder : []);
 const hiddenSet = new Set(layoutHydrated ? sidebarHidden : []);

 const { data: session, isPending } = useSession();
 const sidebarUser = session?.user as SidebarSessionUser | undefined;
 const isAdmin = !!sidebarUser?.isAdmin;
 const { resolved: resolvedUser } = useResolvedUser();
 const unreadCount = useUnreadCount(!!session);
 const { count: notificationCount, refresh: refreshNotificationCount } =
 useNotificationCount(!!session);
 const { counts: reviewCounts } = useAdminReviewCount(isAdmin);
 const streak = useStreak(!!session);
 usePresenceHeartbeat(!!session);

 useEffect(() => {
 function handleClick(e: MouseEvent) {
 if (userMenuRef.current?.contains(e.target as Node)) return;
 setShowUserMenu(false);
 }
 if (showUserMenu) document.addEventListener('mousedown', handleClick);
 return () => document.removeEventListener('mousedown', handleClick);
 }, [showUserMenu]);

 const handleSignOut = async () => {
 await authClient.signOut({
 fetchOptions: {
 onSuccess: () => {
 navigate({ to:'/'});
 window.location.reload();
 },
 },
 });
 };

 // The Inbox nav badge tracks unread *messages* only, so opening a conversation
 // actually clears it. Site notifications (likes/follows/…) are surfaced by
 // their own affordances — the notification bell just below on desktop, and the
 // Notifications tab inside the inbox — so folding them in here would mean
 // reading your messages could never fully clear the badge (the exact confusion
 // users hit). The OS app-icon badge below still reflects the combined total.
 const inboxCount = unreadCount;
 const totalUnread = unreadCount + notificationCount;
 // Mirror the unread total onto the installed-app icon (Badging API). This
 // sidebar is always mounted (display:none on mobile, not unmounted), so it's a
 // single stable place to drive the badge without a second SSE/poll subscriber.
 useAppBadge(session ? totalUnread : 0);

 const renderLeaf = (link: NavLeaf, nested = false, canHost = true) => {
 const Icon = link.icon;
 const label = t(link.tKey, { defaultValue: link.label });
 const isActive =
 link.badge ==='inbox'
 ? !!(
 pathname?.startsWith('/messages') ||
 pathname?.startsWith('/notifications') ||
 pathname?.startsWith('/groups')
 )
 : pathname === link.href || (link.href !=='/'&& pathname?.startsWith(link.href +'/'));
 // Only ONE rendered leaf hosts the shared-layoutId capsule at a time (a pinned
 // child renders both in the rail and inside its group submenu — `canHost`
 // dedupes so two elements never share the layoutId, §5.47).
 const hostsCapsule = isActive && canHost;
 const indent = nested
 ? expanded
 ?'pl-9'
 :'md:justify-center lg:justify-start lg:pl-9'
 : itemJustifyClass;
 // The active pill is now the flowing layoutId capsule (below) — the leaf
 // itself only carries the accent text + hover states. `relative`anchors the
 // absolute capsule; inactive pills keep the pointer light via
 // .glass-interactive + data-glass-light.
 const leafClass = `glass-interactive relative flex min-h-11 items-center gap-2.5 ${itemPadXClass} py-2 rounded-[var(--site-control-radius)] text-sm font-medium transition-colors md:min-h-10 ${indent} ${
 isActive
 ?'text-site-accent'
 :'text-site-text-muted hover:text-site-text hover:bg-site-surface'
 }`;
 const leafInner = (
 <>
 {hostsCapsule && (
 // Outer element owns the layoutId projection; the inner span carries the
 // material + velocity squash so scaling never fights the projection
 // transform. `.glass-liquid`keeps the capsule a signature sheen surface
 // (one active leaf at a time → within the ≤3 ambient-sheen budget, §5.2).
 <motion.span
 ref={capsuleRef}
 layoutId={capsuleLayoutId}
 aria-hidden
 className="absolute inset-0 z-0"
 transition={reduced ? { duration: 0 } : SPRING.snappy}
 >
 <motion.span
 className="glass-liquid absolute inset-0 rounded-[var(--site-control-radius)] bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim-soft)]"
 style={squashStyle}
 />
 </motion.span>
 )}
 {/* Labels/icons ride above the capsule + goo underlay (never filtered). */}
 <span className="relative z-[1] flex min-w-0 items-center gap-2.5">
 {link.badge ==='inbox'? (
 <span className="relative shrink-0">
 <Icon className="w-5 h-5"aria-hidden />
 <NotificationBadge count={inboxCount} className="absolute -top-1.5 -right-1.5"/>
 </span>
 ) : link.badge ==='admin-review'? (
 <span className="relative shrink-0">
 <Icon className="w-5 h-5"aria-hidden />
 <NotificationBadge
 count={reviewCounts.total}
 className="absolute -top-1.5 -right-1.5"
 />
 </span>
 ) : (
 <Icon className="w-5 h-5 shrink-0"aria-hidden />
 )}
 <span className={labelClass}>{label}</span>
 </span>
 </>
 );
 // External/static destinations (e.g. the standalone Deeplink site) need a
 // full page load, so they render a plain anchor rather than a router Link.
 if (link.external) {
 return (
 <a
 key={link.href}
 href={link.href}
 data-glass-light=""
 className={leafClass}
 title={label}
 aria-label={label}
 aria-current={isActive ?'page': undefined}
 >
 {leafInner}
 </a>
 );
 }
 return (
 <Link
 key={link.href}
 to={link.href}
 data-glass-light=""
 className={leafClass}
 title={label}
 aria-label={label}
 aria-current={isActive ?'page': undefined}
 >
 {leafInner}
 </Link>
 );
 };

 // A"More"destination with a pin toggle: pinned items also render in the
 // main rail so frequent app users can promote what they actually use.
 const renderPinnable = (link: NavLeaf, nested: boolean) => {
 const isPinned = pinned.includes(link.href);
 const name = t(link.tKey, { defaultValue: link.label });
 const pinLabel = isPinned
 ? t('nav-unpin', { defaultValue:'Unpin {{name}} from sidebar', name })
 : t('nav-pin', { defaultValue:'Pin {{name}} to sidebar', name });
 return (
 <div key={link.href} className="relative group/pin">
 {/* A pinned child renders in the rail AND its submenu — only the rail copy
 (nested=false) hosts the shared capsule so the layoutId stays unique. */}
 {renderLeaf(link, nested, !nested || !isPinned)}
 <button
 type="button"
 onClick={() => togglePin(link.href)}
 aria-pressed={isPinned}
 aria-label={pinLabel}
 title={pinLabel}
 className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-site-sm p-1 text-site-text-dim transition-opacity hover:text-site-text hover:bg-site-surface-hover focus-visible:opacity-100 ${labelClass} ${
 isPinned ?'opacity-100':'opacity-0 group-hover/pin:opacity-100'
 }`}
 >
 <Pin className="w-3.5 h-3.5"fill={isPinned ?'currentColor':'none'} aria-hidden />
 </button>
 </div>
 );
 };

 return (
 <div
 ref={rootRef}
 className={`flex flex-col gap-0.5 ${rootSizeClass} ${paddingClass}`}
 style={
 expanded
 ? {
 // The drawer aside is fixed top-0 with height 100lvh +
 // --drawer-bleed, so its box deliberately runs past the visual
 // viewport to the physical screen bottom. Add that overhang back as
 // padding so the footer lands above Safari's bar rather than behind
 // it: (100lvh − 100dvh) is the bar itself and collapses to 0 once it
 // minimizes on scroll; --drawer-bleed is the fixed overhang. Not the
 // double-count warned about in globals.css §--safe-bottom — that's
 // about offsetting *fixed* UI, which is already visual-viewport
 // anchored; this is inner padding of an oversized panel.
 paddingBottom:
'calc(1rem + var(--safe-bottom) + (100lvh - 100dvh) + var(--drawer-bleed))',
 }
 : undefined
 }
 >
 {/* Logo row. In the drawer (expanded) it also carries an explicit close
 button pushed to the far edge; on the desktop rail the row has a single
 child, so logoAlignClass centers/starts it exactly as before. */}
 <div
 className={`mb-4 flex items-center shrink-0 border-b border-site-border/60 pb-3 ${
 expanded ?'justify-between gap-2': logoAlignClass
 }`}
 >
 <Link
 to="/"
 className="flex items-center gap-2 group"
 aria-label={t('nav-home', { defaultValue:'RMH Studios home'})}
 >
 <div className="flex h-8 w-8 items-center justify-center rounded-full bg-site-text text-site-bg text-xs font-bold font-mono">
 01
 </div>
 <span
 className={`site-logo font-serif font-bold text-xl tracking-tight text-site-text group-hover:opacity-80 transition-opacity ${logoFullClass}`}
 >
 RMH<span className="font-sans font-normal text-xs uppercase tracking-widest text-site-text-muted ml-1.5">Studios</span>
 </span>
 <span
 className={`site-logo font-serif font-bold text-xl text-site-text ${logoShortClass}`}
 >
 R
 </span>
 </Link>
 {expanded && <MobileSidebarCloseButton />}
 </div>

 {/* Nav Links — its own scroll region on desktop; part of the drawer's
 scroll on mobile (see rootSizeClass/navScrollClass above). The inner
 `relative`wrapper is the goo underlay's positioning context and the
 capsule's coordinate space — it wraps ALL leaves (incl. expanding group
 submenus) so the underlay covers the full content height and stays
 registered with the capsule through scroll (§5.47). */}
 <nav ref={navRef} className={`${navScrollClass} lg:pr-1`}>
 <div className="relative flex flex-col gap-0.5">
 {/* Goo underlay (§5.47) — capsule-only, behind the leaves. */}
 {capsuleUnderlay}
 {orderedNav.map((item) => {
 if (!isNavGroup(item)) {
 if (item.requiresAuth && !session) return null;
 if (item.requiresAdmin && !isAdmin) return null;
 // Hidden leaves drop out of the rail (still reachable via the
 // command palette and their URL — never stranded).
 if (hiddenSet.has(item.id)) return null;
 return renderLeaf(item);
 }
 const Icon = item.icon;
 const groupLabel = t(item.tKey, { defaultValue: item.label });
 const isOpen = !!openGroups[item.group];
 const groupActive = item.children.some((c) => pathname?.startsWith(c.href));
 // Pinned children surface in the main rail, right above their group.
 const pinnedChildren = navHydrated
 ? item.children.filter((c) => pinned.includes(c.href))
 : [];
 return (
 <div key={item.group} className="flex flex-col gap-0.5">
 {pinnedChildren.map((c) => renderPinnable(c, false))}
 <button
 type="button"
 onClick={() => toggleGroup(item.group)}
 aria-expanded={isOpen}
 aria-label={groupLabel}
 className={`flex min-h-11 items-center gap-2.5 ${itemPadXClass} py-2 rounded-[var(--site-control-radius)] text-sm font-medium transition-colors w-full md:min-h-10 ${itemJustifyClass} ${
 groupActive
 ?'text-site-accent bg-site-accent-dim'
 :'text-site-text-muted hover:text-site-text hover:bg-site-surface'
 }`}
 title={groupLabel}
 >
 <Icon className="w-5 h-5 shrink-0"aria-hidden />
 <span className={labelClass}>{groupLabel}</span>
 <ChevronDown
 className={`w-4 h-4 shrink-0 ml-auto transition-transform ${isOpen ?'rotate-180':''} ${labelClass}`}
 />
 </button>
 <AnimatePresence initial={false}>
 {isOpen && (
 <motion.div
 key="submenu"
 variants={SUBMENU_PANEL}
 initial={reduced ? false :'closed'}
 animate="open"
 exit="closed"
 transition={
 reduced ? { duration: 0 } : { duration: 0.24, ease: [0.32, 0.72, 0, 1] }
 }
 className="overflow-hidden"
 >
 <motion.div
 className="flex flex-col gap-0.5 pt-0.5"
 variants={reduced ? undefined : SUBMENU_LIST}
 initial={reduced ? false :'closed'}
 animate="open"
 >
 {item.children.map((c) => (
 <motion.div key={c.href} variants={reduced ? undefined : SUBMENU_ITEM}>
 {renderPinnable(c, true)}
 </motion.div>
 ))}
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>
 </div>
 );
 })}
 </div>
 </nav>

 {/* Notification bell — quick triage without leaving the page */}
 {session && (
 <div className="shrink-0">
 <NotificationsPopover
 count={notificationCount}
 refreshCount={refreshNotificationCount}
 className={`flex min-h-11 items-center gap-2.5 ${itemPadXClass} py-2 rounded-[var(--site-control-radius)] text-sm font-medium transition-colors w-full text-site-text-muted hover:text-site-text hover:bg-site-surface md:min-h-10 ${itemJustifyClass}`}
 labelClass={labelClass}
 />
 </div>
 )}

 {/* Auth Section — pinned to bottom */}
 <div className="border-t border-site-border pt-2 shrink-0">
 {isPending ? (
 <div className="h-10 bg-site-surface rounded-full animate-pulse"/>
 ) : session ? (
 <div className="relative flex items-center gap-2"ref={userMenuRef}>
 <Link
 to={`/u/${sidebarUser?.handle || session.user.id}`as string}
 className={`flex items-center gap-2 px-2 hover:bg-site-surface rounded-full transition-colors py-1 flex-1 min-w-0 ${itemJustifyClass}`}
 >
 <UserAvatar
 src={resolvedUser?.image || session.user.image}
 alt={
 resolvedUser?.name ||
 session.user.name ||
 t('user-avatar-alt', { defaultValue:'User'})
 }
 size={32}
 fallbackName={resolvedUser?.name || session.user.name}
 className="ring-2 ring-site-bg"
 />
 <span className={`${labelClass} text-sm text-site-text truncate max-w-30`}>
 {resolvedUser?.name || session.user.name}
 </span>
 </Link>
 <button
 ref={userMenuBtnRef}
 onClick={() => {
 if (!showUserMenu && userMenuBtnRef.current) {
 const rect = userMenuBtnRef.current.getBoundingClientRect();
 const margin = 8;
 const menuWidth = 192; // w-48
 const menuHeight = 240; // ~5 items + padding
 // Use the visual viewport (the actually-visible area) when
 // available so the clamp stays correct if the mobile URL bar
 // or on-screen keyboard has shrunk the viewport.
 const vw = window.visualViewport?.width ?? window.innerWidth;
 const vh = window.visualViewport?.height ?? window.innerHeight;
 // In the mobile drawer (`expanded`) the menu is a fixed child of
 // the transformed <aside>, so its containing block is that 256px
 // (w-64) panel — measure `right`from the panel's edge, not the
 // viewport's, or it lands off to the left. On desktop the aside
 // isn't transformed and the containing block is the viewport.
 const cbRight = expanded ? 256 : vw;
 const right = Math.min(
 Math.max(cbRight - rect.right, margin),
 Math.max(cbRight - menuWidth - margin, margin),
 );
 const bottom = Math.min(
 Math.max(vh - rect.top + 8, margin),
 Math.max(vh - menuHeight - margin, margin),
 );
 setUserMenuPos({ bottom, right });
 }
 setShowUserMenu(!showUserMenu);
 }}
 className={`p-1.5 rounded-site-sm text-site-text-muted hover:text-site-text hover:bg-site-surface transition-colors shrink-0 ${expanded ?'':'hidden lg:block'}`}
 title={t('more-options', { defaultValue:'More options'})}
 >
 <MoreHorizontal className="w-4 h-4"/>
 </button>
 {userMenuUnderlay}
 {showUserMenu && (
 <div
 ref={userMenuPopRef}
 className="bg-site-surface border border-site-border rounded-2xl shadow-xs fixed w-48 py-1 z-50"
 style={{
 bottom: `${userMenuPos.bottom}px`,
 right: `${userMenuPos.right}px`,
 }}
 >
 <Link
 to={`/u/${sidebarUser?.handle || session.user.id}`as string}
 onClick={() => setShowUserMenu(false)}
 className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <User className="w-4 h-4"/>
 <span>{t('profile', { defaultValue:'Profile'})}</span>
 </Link>
 <Link
 to="/progress"
 onClick={() => setShowUserMenu(false)}
 className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <Zap className="w-4 h-4"/>
 <span>
 {t('progress', { defaultValue:'Progress'})}
 {streak && streak.current > 0 ? `· ${streak.current}🔥`:''}
 </span>
 </Link>
 <Link
 to="/bookmarks"
 onClick={() => setShowUserMenu(false)}
 className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <Bookmark className="w-4 h-4"/>
 <span>{t('bookmarks', { defaultValue:'Bookmarks'})}</span>
 </Link>
 <Link
 to="/help"
 onClick={() => setShowUserMenu(false)}
 className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <HelpCircle className="w-4 h-4"/>
 <span>{t('help', { defaultValue:'Help'})}</span>
 </Link>
 <Link
 to="/settings"
 onClick={() => setShowUserMenu(false)}
 className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-text hover:bg-site-surface-hover transition-colors"
 >
 <Settings className="w-4 h-4"/>
 <span>{t('settings', { defaultValue:'Settings'})}</span>
 </Link>
 <div className="my-1 border-t border-site-border"/>
 <button
 onClick={() => {
 setShowUserMenu(false);
 handleSignOut();
 }}
 className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 text-site-text-muted hover:text-site-danger hover:bg-site-surface-hover transition-colors"
 >
 <LogOut className="w-4 h-4"/>
 <span>{t('sign-out', { defaultValue:'Sign Out'})}</span>
 </button>
 </div>
 )}
 </div>
 ) : (
 // Signed-out: a sign-in CTA with a compact Settings gear beside it, so
 // appearance and language (saved locally, synced on sign-in) stay
 // reachable without an account. The gear sits next to the button when
 // there's room (mobile drawer / lg rail) and stacks under it in the
 // narrow icon rail.
 <div
 className={`flex gap-2 ${expanded ?'items-center':'flex-col lg:flex-row lg:items-center'}`}
 >
 <Link
 to="/login"
 search={{ callbackURL: undefined }}
 aria-label={t('sign-in', { defaultValue:'Sign In'})}
 className={expanded ?'min-w-0 flex-1':'lg:min-w-0 lg:flex-1'}
 >
 <Button
 variant="accent"
 size="sm"
 className="w-full"
 aria-label={t('sign-in', { defaultValue:'Sign In'})}
 >
 <User className={`w-4 h-4 ${iconMrClass}`} aria-hidden />
 <span className={labelClass}>{t('sign-in', { defaultValue:'Sign In'})}</span>
 </Button>
 </Link>
 <Link
 to="/settings"
 className="flex shrink-0 items-center justify-center rounded-full p-2.5 text-site-text-muted transition-colors hover:bg-site-surface hover:text-site-text"
 title={t('settings', { defaultValue:'Settings'})}
 aria-label={t('settings', { defaultValue:'Settings'})}
 >
 <Settings className="w-5 h-5 shrink-0"/>
 </Link>
 </div>
 )}
 </div>

 {/* Small breathing room below the auth section so it isn't flush against
 the bottom of the scroll area. */}
 <div className="h-1 shrink-0"aria-hidden="true"/>
 </div>
 );
}
