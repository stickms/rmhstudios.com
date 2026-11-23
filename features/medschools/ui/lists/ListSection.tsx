import { useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { MenuItem } from '@/components/ui/menu';
import { SortableList } from '@/components/ui/sortable-list';
import type { MedListDto } from '../../medschools.contract';
import { ListItemRow } from './ListItemRow';

/**
 * One saved list: the name with its actions (rename and delete in a menu), the count, "Add to my tracker", then the
 * schools as rows on rules, reorderable (`SortableList`: drag, or the always-present up and down buttons).
 */
export function ListSection({
  list,
  onRename,
  onDelete,
  onAddToTracker,
  onReorderItems,
  onSaveNote,
  onRemoveItem,
}: {
  list: MedListDto;
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
    <section aria-label={list.name} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 border-b border-site-border pb-2">
        <h2 className="t-heading m-0 min-w-0 flex-1 break-words">{list.name}</h2>
        <span className="t-meta">
          {t('lists-count', {
            count: list.items.length,
            defaultValue_one: '{{count}} school',
            defaultValue_other: '{{count}} schools',
            defaultValue: '{{count}} schools',
          })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          loading={adding}
          disabled={list.items.length === 0}
          onClick={() => {
            setAdding(true);
            onAddToTracker().finally(() => setAdding(false));
          }}
        >
          {t('lists-add-to-tracker', { defaultValue: 'Add this list to my tracker' })}
        </Button>
        <IconButton
          ref={triggerRef}
          icon={MoreHorizontal}
          label={t('lists-actions', { defaultValue: 'Actions for {{name}}', name: list.name })}
          aria-haspopup="menu"
          aria-expanded={menu}
          showTooltip={false}
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
        <p className="t-meta m-0">
          {t('lists-empty', { defaultValue: 'No schools yet. Use the bookmark on a school to save it here.' })}
        </p>
      ) : (
        <SortableList
          items={list.items}
          itemLabel={(i) => i.school.shortName}
          onReorder={(next) => onReorderItems(next.map((i) => i.id))}
          className="gap-0"
          renderItem={(item) => (
            <ListItemRow
              item={item}
              onSaveNote={(note) => onSaveNote(item.id, note)}
              onRemove={() => onRemoveItem(item.id)}
            />
          )}
        />
      )}
    </section>
  );
}
