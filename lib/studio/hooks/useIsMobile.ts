/**
 * Consolidated to a single source of truth. This module historically defined
 * its own copy of `useIsMobile` (same 768px breakpoint); it now re-exports the
 * canonical site-wide hook, which uses `useSyncExternalStore` to avoid a
 * hydration flash. See `hooks/useIsMobile.ts`.
 */
export { useIsMobile } from '@/hooks/useIsMobile';
