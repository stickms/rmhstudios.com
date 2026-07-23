'use client';

import * as React from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { IconButton } from '@/components/ui/icon-button';
import { SPRING } from '@/lib/motion';

/**
 * SortableList (groundwork G2) — drag-to-reorder on pointer devices, with
 * **always-present** ▲/▼ buttons so touch and keyboard users can reorder
 * without a drag gesture (mobile baseline §2.6.7 in
 * `docs/plans/2026-07-20-parity-qol-customization-design.md`). Used by Saves
 * folders (§4), Profile modules (§12), and Home widgets (§15).
 *
 * Controlled: the caller owns `items` and receives the reordered array via
 * `onReorder`. Each item must have a stable string `id`. `renderItem` renders
 * the row body; the frame supplies the grip handle and move buttons.
 *
 * ```tsx
 * <SortableList items={folders} onReorder={setFolders}
 * renderItem={(f) => <span>{f.name}</span>} />
 * ```
 */
export interface SortableItem {
 id: string;
}

export interface SortableListProps<T extends SortableItem> {
 items: T[];
 onReorder: (next: T[]) => void;
 renderItem: (item: T, index: number) => React.ReactNode;
 /** Accessible label prefix for the move buttons, e.g. the item's name. */
 itemLabel?: (item: T) => string;
 className?: string;
}

export function SortableList<T extends SortableItem>({
 items,
 onReorder,
 renderItem,
 itemLabel,
 className,
}: SortableListProps<T>) {
 const move = React.useCallback(
 (from: number, to: number) => {
 if (to < 0 || to >= items.length) return;
 const next = items.slice();
 const [moved] = next.splice(from, 1);
 next.splice(to, 0, moved);
 onReorder(next);
 },
 [items, onReorder]
 );

 return (
 <Reorder.Group
 axis="y"
 values={items}
 onReorder={onReorder}
 className={cn('flex flex-col gap-2', className)}
 >
 {items.map((item, index) => (
 <SortableRow
 key={item.id}
 item={item}
 index={index}
 count={items.length}
 onMove={move}
 label={itemLabel?.(item)}
 >
 {renderItem(item, index)}
 </SortableRow>
 ))}
 </Reorder.Group>
 );
}

function SortableRow<T extends SortableItem>({
 item,
 index,
 count,
 onMove,
 label,
 children,
}: {
 item: T;
 index: number;
 count: number;
 onMove: (from: number, to: number) => void;
 label?: string;
 children: React.ReactNode;
}) {
 const controls = useDragControls();
 const { t } = useTranslation('c-ui');
 const name = label ? ` ${label}` : '';

 return (
 <Reorder.Item
 value={item}
 dragListener={false}
 dragControls={controls}
 transition={SPRING.soft}
 // L1 bg-site-surface border border-site-border row — cheap, unlimited, matches list surfaces.
 className="bg-site-surface border border-site-border flex items-center gap-2 rounded-2xl px-3 py-2 text-site-text"
 >
 {/* Drag handle (pointer devices). Touch/keyboard users use the buttons. */}
 <span
 onPointerDown={(e) => controls.start(e)}
 className="cursor-grab touch-none text-site-text-dim active:cursor-grabbing"
 aria-hidden
 >
 <GripVertical className="h-4 w-4" />
 </span>

 <div className="min-w-0 flex-1">{children}</div>

 <div className="flex shrink-0 items-center">
 <IconButton
 icon={ChevronUp}
 size="icon-sm"
 variant="ghost"
 disabled={index === 0}
 onClick={() => onMove(index, index - 1)}
 label={t('move-up', { defaultValue: 'Move up{{name}}', name })}
 />
 <IconButton
 icon={ChevronDown}
 size="icon-sm"
 variant="ghost"
 disabled={index === count - 1}
 onClick={() => onMove(index, index + 1)}
 label={t('move-down', { defaultValue: 'Move down{{name}}', name })}
 />
 </div>
 </Reorder.Item>
 );
}
