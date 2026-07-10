'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export interface NeumorphicModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'info';
}

export function NeumorphicModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText,
    cancelText,
    variant = 'info'
}: NeumorphicModalProps) {
    const { t } = useTranslation("c-game");
    const resolvedConfirmText = confirmText ?? t("confirm", { defaultValue: "Confirm" });
    const resolvedCancelText = cancelText ?? t("cancel", { defaultValue: "Cancel" });
    return (
        <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay 
                    className="fixed inset-0 z-100 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" 
                />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed left-[50%] top-[50%] z-101 w-[90%] max-w-md translate-x-[-50%] translate-y-[-50%] p-8 outline-none",
                        "bg-slice-bg rounded-[2.5rem]",
                        "shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)]",
                        "border border-slice-shadow-light/20",
                        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] duration-300"
                    )}
                >
                    <div className="flex flex-col items-center text-center space-y-6">
                        {variant === 'danger' && (
                            <div className="w-16 h-16 rounded-2xl bg-slice-bg shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] flex items-center justify-center text-red-500 mb-2">
                                <AlertTriangle className="w-8 h-8" />
                            </div>
                        )}

                        <div className="space-y-2">
                            <DialogPrimitive.Title className="text-2xl font-black text-slice-text-darker uppercase tracking-tight">
                                {title}
                            </DialogPrimitive.Title>
                            <DialogPrimitive.Description className="text-slice-text-muted font-medium leading-relaxed">
                                {description}
                            </DialogPrimitive.Description>
                        </div>

                        <div className="flex gap-4 w-full pt-4">
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                className="flex-1 py-6 rounded-2xl text-slice-text-light font-bold hover:text-slice-text hover:bg-slice-shadow-dark/20 transition-all shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]"
                            >
                                {resolvedCancelText}
                            </Button>
                            <Button
                                onClick={() => {
                                    onConfirm();
                                    onClose();
                                }}
                                className={cn(
                                    "flex-1 py-6 rounded-2xl font-black tracking-widest transition-all shadow-lg transform active:scale-95",
                                    variant === 'danger' 
                                        ? "bg-red-500 hover:bg-red-600 text-white shadow-[0_10px_20px_rgba(239,68,68,0.4)]" 
                                        : "bg-blue-500 hover:bg-blue-600 text-white shadow-[0_10px_20px_rgba(59,130,246,0.4)]"
                                )}
                            >
                                {resolvedConfirmText}
                            </Button>
                        </div>
                    </div>

                    <DialogPrimitive.Close asChild>
                        <button
                            className="absolute top-6 right-6 p-2 rounded-xl text-slice-text-light hover:text-slice-text transition-colors shadow-[4px_4px_8px_var(--slice-shadow-dark),-4px_-4px_8px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]"
                            aria-label={t("close", { defaultValue: "Close" })}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </DialogPrimitive.Close>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
