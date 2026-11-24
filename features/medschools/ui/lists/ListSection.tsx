import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MedButton } from '../controls/MedButton';
import { MedIconButton } from '../controls/MedIconButton';
import { MenuItem } from '@/components/ui/menu';
import { SortableList } from '@/components/ui/sortable-list';
import type { MedListDto } from '../../medschools.contract';
import { RollingSection } from '../rolling/RollingSection';
import { OverlapSection } from '../secondaries/OverlapSection';
import { ListItemRow } from './ListItemRow';

/**
 * One saved list: the name with its actions (rename and delete in a menu), the count, "Add to my tracker", then the
 * schools as rows on rules, reorderable (`SortableList`: drag, or the always-present up and down buttons).
 */
export function ListSection({
  list,
  onMove,
  canMoveUp,
  canMoveDown,
  onRename,
  onDelete,
  onAddToTracker,
  onReorderItems,
  onSaveNote,
  onRemoveItem,
}: {
  list: MedListDto;
  /** Move the list one place up (-1) or down (1): the lists reorder from this menu, the schools by SortableList. */
  onMove: (by: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: () => void;
  onDelete: () => void;
  onAddToTracker: () => Promise<void>;
  onReorderItems: (ids: string[]) => void;
  onSaveNote: (itemId: string, note: string | null) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
}) {
  const { t } = useTranslation('medschools');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <section aria-label={list.name} className="medapp-section medapp-section--panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-app-border pb-3">
        <h2 className="medapp-h2 w-full min-w-0 break-words sm:w-auto sm:flex-1">{list.name}</h2>
        <span className="medapp-meta">
          {t('lists-count', {
            count: list.items.length,
            defaultValue_one: '{{count}} school',
            defaultValue_other: '{{count}} schools',
            defaultValue: '{{count}} schools',
          })}
        </span>
        <MedButton
          variant="ghost"

          loading={adding}
          disabled={list.items.length === 0}
          onClick={() => {
            setAdding(true);
            onAddToTracker().finally(() => setAdding(false));
          }}
        >
          {t('lists-add-to-tracker', { defaultValue: 'Add this list to my tracker' })}
        </MedButton>
        <MedIconButton
          ref={triggerRef}
          icon={MoreHorizontal}
          label={t('lists-actions', { defaultValue: 'Actions for {{name}}', name: list.name })}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        />
        <AnchoredMenu
          open={menu}
          onClose={() => setMenu(false)}
          anchorRef={triggerRef}
          label={t('lists-actions-menu', { defaultValue: 'List actions' })}
          className="w-44"
        >
          <MenuItem
            icon={Pencil}
            onSelect={() => {
              setMenu(false);
              onRename();
            }}
          >
            {t('lists-rename', { defaultValue: 'Rename' })}
          </MenuItem>
          <MenuItem
            icon={ChevronUp}
            disabled={!canMoveUp}
            onSelect={() => {
              setMenu(false);
              onMove(-1);
            }}
          >
            {t('lists-move-up', { defaultValue: 'Move up' })}
          </MenuItem>
          <MenuItem
            icon={ChevronDown}
            disabled={!canMoveDown}
            onSelect={() => {
              setMenu(false);
              onMove(1);
            }}
          >
            {t('lists-move-down', { defaultValue: 'Move down' })}
          </MenuItem>
          <MenuItem
            icon={Trash2}
            tone="danger"
            onSelect={() => {
              setMenu(false);
              onDelete();
            }}
          >
            {t('lists-delete', { defaultValue: 'Delete' })}
          </MenuItem>
        </AnchoredMenu>
      </div>
      {list.items.length === 0 ? (
        <p className="medapp-meta">
          {t('lists-empty', { defaultValue: 'No schools yet. Use the bookmark on a school to save it here.' })}
        </p>
      ) : (
        <SortableList
          items={list.items}
          itemLabel={(i) => i.school.shortName}
          onReorder={(next) => onReorderItems(next.map((i) => i.id))}
          className="gap-0"
          // A phone has 288 px: the row's own side padding and the drag handle (the up and down buttons stay) would leave
          // the school name and the note about 150 px; the move buttons stack for the same reason.
          rowClassName="px-0 text-app-text"
          handleClassName="max-sm:hidden text-app-text-muted"
          controlsClassName="max-sm:flex-col"
          renderItem={(item) => (
            <ListItemRow
              item={item}
              onSaveNote={(note) => onSaveNote(item.id, note)}
              onRemove={() => onRemoveItem(item.id)}
            />
          )}
        />
      )}
      {list.items.length > 0 ? (
        <div className="medapp-disclosures">
          <RollingSection source={{ source: 'list', list: list.id }} />
          <OverlapSection source={{ source: 'list', list: list.id }} />
        </div>
      ) : null}
    </section>
  );
}
