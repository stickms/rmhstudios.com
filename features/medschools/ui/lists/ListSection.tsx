import { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ListPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MedIconButton } from '../controls/MedIconButton';
import { MenuItem } from '@/components/ui/menu';
import type { MedListDto } from '../../medschools.contract';
import { RollingSection } from '../rolling/RollingSection';
import { OverlapSection } from '../secondaries/OverlapSection';
import { ListItemRow } from './ListItemRow';

/**
 * One saved list: the name with its count under it and one "⋯" holding add to my tracker, rename, move and delete;
 * then the schools as rows on rules, each with its own "⋯" (note, move up and down, remove), so nothing floats beside a
 * row; then the closed rolling and overlap disclosures.
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
  /** Move the list one place up (-1) or down (1): the lists reorder from this menu, the schools from their own. */
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
  const moveItem = (from: number, by: -1 | 1) => {
    const ids = list.items.map((i) => i.id);
    const to = from + by;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    onReorderItems(ids);
  };
  return (
    <section aria-label={list.name} className="medapp-section medapp-section--panel">
      <div className="medapp-head">
        <div className="medapp-head__text">
          <h2 className="medapp-h2">{list.name}</h2>
          <span className="medapp-meta">
            {t('lists-count', {
              count: list.items.length,
              defaultValue_one: '{{count}} school',
              defaultValue_other: '{{count}} schools',
              defaultValue: '{{count}} schools',
            })}
          </span>
        </div>
        <MedIconButton
          ref={triggerRef}
          icon={MoreHorizontal}
          label={t('lists-actions', { defaultValue: 'Actions for {{name}}', name: list.name })}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-busy={adding || undefined}
          onClick={() => setMenu((v) => !v)}
        />
        <AnchoredMenu
          open={menu}
          onClose={() => setMenu(false)}
          anchorRef={triggerRef}
          label={t('lists-actions-menu', { defaultValue: 'List actions' })}
          className="w-60"
        >
          <MenuItem
            icon={ListPlus}
            disabled={list.items.length === 0 || adding}
            onSelect={() => {
              setMenu(false);
              setAdding(true);
              onAddToTracker().finally(() => setAdding(false));
            }}
          >
            {t('lists-add-to-tracker', { defaultValue: 'Add this list to my tracker' })}
          </MenuItem>
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
        <ul className="medapp-rows medapp-rows--ruled">
          {list.items.map((item, i) => (
            <li key={item.id}>
              <ListItemRow
                item={item}
                onSaveNote={(note) => onSaveNote(item.id, note)}
                onRemove={() => onRemoveItem(item.id)}
                onMove={(by) => moveItem(i, by)}
                canMoveUp={i > 0}
                canMoveDown={i < list.items.length - 1}
              />
            </li>
          ))}
        </ul>
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
