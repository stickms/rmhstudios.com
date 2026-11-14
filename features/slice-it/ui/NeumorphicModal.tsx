import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  AlertTriangle,
} from 'lucide-react';
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
  variant?:
    | 'danger'
    | 'info';
}

export function NeumorphicModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  variant = 'info',
}: NeumorphicModalProps) {
  const {
    t,
  } =
    useTranslation(
      'c-game',
    );
  const resolvedConfirmText =
    confirmText ??
    t(
      'confirm',
      {
        defaultValue:
          'Confirm',
      },
    );
  const resolvedCancelText =
    cancelText ??
    t(
      'cancel-neumorphic-modal',
      {
        defaultValue:
          'Cancel',
      },
    );
  return (
    <DialogPrimitive.Root
      open={
        isOpen
      }
      onOpenChange={(
        open,
      ) =>
        !open &&
        onClose()
      }
    >
      <DialogPrimitive.Portal>
        {/* `slice-tokens` on BOTH portalled elements. Radix portals to
            `<body>`, which is outside every `.slice-theme` in the tree, so
            `bg-slice-bg` and the shadow pairs below resolved to nothing — the
            modal rendered in browser defaults and looked the same in light and
            dark, which is exactly what a themed dialog must not do. It is
            `slice-tokens` rather than `slice-theme` because the latter also
            paints, and an opaque scrim is not a scrim. */}
        <DialogPrimitive.Overlay
          data-motion="fade"
          className="slice-tokens fixed inset-0 z-100 bg-black/65"
        />
        <DialogPrimitive.Content
          data-motion="rise"
          className={cn(
            'slice-tokens fixed left-[50%] top-[50%] z-101 w-[90%] max-w-md translate-x-[-50%] translate-y-[-50%] p-7 outline-none',
            'bg-slice-card-bg text-slice-text font-(family-name:--slice-body) rounded-[10px]',
            'border border-slice-primary/60 shadow-[0_0_0_1px_rgba(24,182,255,0.12),0_24px_60px_rgba(0,0,0,0.65)]',
          )}
        >
          <div className="flex flex-col items-center text-center space-y-5">
            {variant ===
              'danger' && (
              <div className="w-14 h-14 rounded-[10px] bg-slice-input-bg border border-slice-danger/60 flex items-center justify-center text-slice-danger">
                <AlertTriangle className="w-7 h-7" />
              </div>
            )}

            <div className="space-y-2">
              <DialogPrimitive.Title className="slice-display text-xl text-slice-text-darker uppercase">
                {
                  title
                }
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-slice-text-muted font-medium leading-relaxed">
                {
                  description
                }
              </DialogPrimitive.Description>
            </div>

            <div className="flex gap-3 w-full pt-2">
              <Button
                variant="ghost"
                onClick={
                  onClose
                }
                className="flex-1 h-11 rounded-[10px] border border-slice-border text-slice-text-muted font-bold hover:text-slice-text hover:bg-slice-surface-hover transition-colors"
              >
                {
                  resolvedCancelText
                }
              </Button>
              <Button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  'flex-1 h-11 rounded-[10px] font-bold tracking-wider transition-colors text-[#050921]',
                  variant ===
                    'danger'
                    ? 'bg-slice-danger hover:brightness-110'
                    : 'bg-slice-primary hover:brightness-110',
                )}
              >
                {
                  resolvedConfirmText
                }
              </Button>
            </div>
          </div>

          <DialogPrimitive.Close
            asChild
          >
            <button
              className="absolute top-4 right-4 p-2 rounded-[8px] text-slice-text-muted hover:text-slice-text hover:bg-slice-surface-hover transition-colors"
              aria-label={t(
                'close-neumorphic-modal',
                {
                  defaultValue:
                    'Close',
                },
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
