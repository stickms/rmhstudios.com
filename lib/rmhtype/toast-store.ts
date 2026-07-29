/**
 * rmhtype toasts — re-export of the shared app toast store.
 *
 * The implementation lives in `lib/shared/app-toast.ts`; this module stays as
 * the app's entry point so `@/lib/rmhtype/toast-store` imports keep resolving.
 */

export { useToastStore, toast, type Toast, type ToastType } from '@/lib/shared/app-toast';
