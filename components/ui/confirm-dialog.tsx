'use client';

import * as React from 'react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmOptions {
 /** Heading — a short question ("Remove this passkey?"). */
 title: React.ReactNode;
 /** Supporting sentence describing the consequence. */
 description?: React.ReactNode;
 /** Confirm button text. Defaults to "Confirm". */
 confirmLabel?: string;
 /** Cancel button text. Defaults to "Cancel". */
 cancelLabel?: string;
 /** Style the confirm button as destructive and show a warning icon. */
 danger?: boolean;
 /** Override the leading icon (defaults to a warning triangle when danger). */
 icon?: LucideIcon;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

interface PendingState extends ConfirmOptions {
 resolve: (value: boolean) => void;
}

/**
 * Themed, accessible replacement for the native `window.confirm`.
 *
 * Mount `<ConfirmProvider>` once near the app root, then call `useConfirm()`
 * from anywhere:
 *
 * ```tsx
 * const confirm = useConfirm();
 * if (await confirm({ title: 'Delete draft?', danger: true })) deleteDraft();
 * ```
 *
 * Built on the shared `Dialog` primitive, so it inherits focus-trapping,
 * Escape-to-dismiss, the `--site-*` token styling (works across every theme),
 * and i18n — none of which the native `confirm()` dialog provides.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
 const { t } = useTranslation('c-ui');
 const [pending, setPending] = React.useState<PendingState | null>(null);

 const confirm = React.useCallback<ConfirmFn>((options) => {
 return new Promise<boolean>((resolve) => {
 setPending({ ...options, resolve });
 });
 }, []);

 const settle = React.useCallback((value: boolean) => {
 setPending((current) => {
 current?.resolve(value);
 return null;
 });
 }, []);

 const Icon = pending?.icon ?? (pending?.danger ? AlertTriangle : undefined);

 return (
 <ConfirmContext.Provider value={confirm}>
 {children}
 <Dialog
 open={pending !== null}
 onOpenChange={(open) => {
 // Any dismissal (Escape, overlay click, close X) resolves to false.
 if (!open) settle(false);
 }}
 >
 {pending && (
 <DialogContent className="max-w-sm">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 {Icon && (
 <Icon
 className={
 pending.danger
 ? 'h-5 w-5 shrink-0 text-site-danger'
 : 'h-5 w-5 shrink-0 text-site-accent'
 }
 aria-hidden
 />
 )}
 {pending.title}
 </DialogTitle>
 {pending.description && <DialogDescription>{pending.description}</DialogDescription>}
 </DialogHeader>
 <DialogFooter>
 <Button variant="outline" onClick={() => settle(false)}>
 {pending.cancelLabel ?? t('cancel', { defaultValue: 'Cancel' })}
 </Button>
 <Button variant={pending.danger ? 'danger' : 'default'} onClick={() => settle(true)}>
 {pending.confirmLabel ?? t('confirm', { defaultValue: 'Confirm' })}
 </Button>
 </DialogFooter>
 </DialogContent>
 )}
 </Dialog>
 </ConfirmContext.Provider>
 );
}

/**
 * Returns an async `confirm(options) => Promise<boolean>`. Resolves `true` when
 * the user confirms, `false` on cancel/dismiss. Requires `<ConfirmProvider>`
 * to be mounted above the caller (it is, at the app root).
 */
export function useConfirm(): ConfirmFn {
 const ctx = React.useContext(ConfirmContext);
 if (!ctx) {
 throw new Error('useConfirm must be used within a <ConfirmProvider>');
 }
 return ctx;
}
