import { useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, ChevronUp, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import type { DeckFolderSummary } from '@/lib/study/folders';

/**
 * A folder's heading row on the deck list: a chevron that collapses it, the name, its deck and due counts,
 * a "Review" link into `/study/review?folder=`, and the folder menu. A row on a rule, not a box.
 */
export function DeckFolderRow({
  folder,
  collapsed,
  deckCount,
  dueCount,
  isFirst,
  isLast,
  onToggle,
  onRename,
  onMove,
  onDelete,
  children,
}: {
  folder: DeckFolderSummary;
  collapsed: boolean;
  deckCount: number;
  dueCount: number;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onRename: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
  /** The folder's decks, shown while it is expanded. */
  children: ReactNode;
}) {
  const { t } = useTranslation('deck-folders');
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const bodyId = `deck-folder-${folder.id}`;

  return (
    <section className="border-b border-site-border">
      <div className="flex items-center gap-1 px-2">
        <Button
          variant="ghost"
          size="icon"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={
            collapsed
              ? t('expand-folder', { name: folder.name, defaultValue: 'Expand {{name}}' })
              : t('collapse-folder', { name: folder.name, defaultValue: 'Collapse {{name}}' })
          }
          onClick={onToggle}
        >
          {collapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
        </Button>
        {/* The counts sit under the name, as on a deck row: beside it, at 390px they left the name one letter wide. */}
        <div className="min-w-0 flex-1 py-2">
          <h3 className="t-heading truncate" dir="auto">
            {folder.name}
          </h3>
          <span className="t-meta block">
            {t('folder-counts', {
              count: deckCount,
              due: dueCount,
              defaultValue_one: '{{count}} deck · {{due}} due',
              defaultValue_other: '{{count}} decks · {{due}} due',
            })}
          </span>
        </div>
        {dueCount > 0 && (
          <Link to="/study/review" search={{ folder: folder.id }}>
            <Button variant="default" size="sm">
              {t('review-folder', { defaultValue: 'Review' })}
            </Button>
          </Link>
        )}
        <Button
          ref={anchorRef}
          variant="ghost"
          size="icon"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('folder-menu', { name: folder.name, defaultValue: 'Options for {{name}}' })}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal aria-hidden />
        </Button>
        <AnchoredMenu
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          label={t('folder-options', { defaultValue: 'Folder options' })}
          align="end"
          className="w-52"
        >
          <MenuItem
            icon={Pencil}
            onSelect={() => {
              setOpen(false);
              onRename();
            }}
          >
            {t('rename-folder', { defaultValue: 'Rename' })}
          </MenuItem>
          <MenuItem
            icon={ChevronUp}
            disabled={isFirst}
            onSelect={() => {
              setOpen(false);
              onMove('up');
            }}
          >
            {t('move-folder-up', { defaultValue: 'Move up' })}
          </MenuItem>
          <MenuItem
            icon={ChevronDown}
            disabled={isLast}
            onSelect={() => {
              setOpen(false);
              onMove('down');
            }}
          >
            {t('move-folder-down', { defaultValue: 'Move down' })}
          </MenuItem>
          <MenuItem
            icon={Trash2}
            tone="danger"
            onSelect={() => {
              setOpen(false);
              onDelete();
            }}
          >
            {t('delete-folder', { defaultValue: 'Delete' })}
          </MenuItem>
        </AnchoredMenu>
      </div>
      <div id={bodyId} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
