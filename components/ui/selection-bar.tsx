'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DURATION, EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * SelectionBar (B9) — the action bar that appears once a list has a selection.
 *
 * L3 `.glass-chrome`: it is persistent chrome pinned to the bottom of the list
 * it belongs to, not a floating popover, so it takes the chrome tier rather than
 * `.glass-overlay`. It is `sticky`, never `fixed` — a bar that escapes its
 * container ends up over unrelated content the moment the list is inside a sheet
 * or a modal, which is where most editable lists on this site live.
 *
 * The count is announced (`aria-live="polite"`) because the selection changes
 * are driven by clicks and arrow keys somewhere else on the page: without it a
 * screen-reader user gets no feedback that anything happened.
 */

export interface SelectionAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: React.ComponentProps<typeof Button>['variant'];
  disabled?: boolean;
}

export interface SelectionBarProps {
  count: number;
  actions: SelectionAction[];
  onClear: () => void;
  /** Shown as a "Select all" affordance when provided and not everything is picked. */
  onSelectAll?: () => void;
  allSelected?: boolean;
  className?: string;
}

export function SelectionBar({
  count,
  actions,
  onClear,
  onSelectAll,
  allSelected = false,
  className,
}: SelectionBarProps) {
  const { t } = useTranslation('c-ui');
  const reduced = useReducedMotion();

  // Reduced motion: appear/disappear, no slide. The bar still needs to *appear*
  // — removing the transition is not the same as removing the element.
  const variants = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: 12 },
      };

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          data-slot="selection-bar"
          role="toolbar"
          aria-label={t('selection-actions', { defaultValue: 'Selection actions' })}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: DURATION.fast, ease: EASE.standard }}
          className={cn(
            'glass-chrome sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 rounded-site px-3 py-2',
            className,
          )}
        >
          <span aria-live="polite" className="text-sm font-medium text-site-text">
            {t('selection-count', { count, defaultValue: '{{count}} selected' })}
          </span>

          {onSelectAll && !allSelected && (
            <Button variant="ghost" size="xs" onClick={onSelectAll}>
              {t('select-all', { defaultValue: 'Select all' })}
            </Button>
          )}

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.id}
                variant={action.variant ?? 'secondary'}
                size="sm"
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.icon ? <action.icon aria-hidden /> : null}
                {action.label}
              </Button>
            ))}
            <IconButton
              icon={X}
              size="icon-sm"
              variant="ghost"
              onClick={onClear}
              label={t('clear-selection', { defaultValue: 'Clear selection' })}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
