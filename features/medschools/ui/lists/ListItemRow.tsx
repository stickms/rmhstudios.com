import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { MedButton } from '../controls/MedButton';
import { MedIconButton } from '../controls/MedIconButton';
import { MedTextarea } from '../controls/MedField';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { LIMITS } from '../../engine/tracker';
import type { MedListItemDto } from '../../medschools.contract';
import { SchoolCrest } from '../SchoolCrest';
import { useMedLabels } from '../labels';

/** Characters as a person counts them (code points), the same unit the server's cap uses. */
export const codePointCount = (s: string): number => [...s].length;

/**
 * One saved school, a row on a rule: the crest, the school (a link while it is listed, no underline at rest), `degree ·
 * state · program`, the note as text that opens its editor, and one "⋯" holding the note, the move up and down, and
 * remove. The note is closed until asked for and saved when the field loses focus. A school that was deactivated stays
 * in the list, as plain text with a line saying so, because a link would 404.
 */
export function ListItemRow({
  item,
  onSaveNote,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  item: MedListItemDto;
  onSaveNote: (note: string | null) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Move this school one place up (-1) or down (1) in its list. */
  onMove: (by: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const [note, setNote] = useState(item.note ?? '');
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const school = item.school;
  const program =
    item.program === 'ANY'
      ? t('program-either', { defaultValue: 'Either program' })
      : programFilterLabel(item.program, school.degree);

  const commit = () => {
    setEditing(false);
    const next = note.trim() ? note : null;
    if (next === (item.note ?? null)) return;
    setBusy(true);
    onSaveNote(next).finally(() => setBusy(false));
  };
  // While a save is on its way the row shows what was typed, not the note it is replacing.
  const shownNote = busy ? note.trim() : item.note;
  const openNote = () => {
    setNote(item.note ?? '');
    setEditing(true);
  };

  return (
    <div className="medapp-item">
      <div className="medapp-item__head">
        <span className="medapp-crest-cell">
          <SchoolCrest slug={school.slug} name={school.shortName} size={40} />
        </span>
        <div className="medapp-item__title">
          {school.active ? (
            <Link
              to="/med/$slug"
              params={{ slug: school.slug }}
              search={SCHOOL_SEARCH_DEFAULTS}
              className="medapp-name"
            >
              {school.name}
            </Link>
          ) : (
            <span className="medapp-name">{school.name}</span>
          )}
          <p className="medapp-meta">
            {t('lists-item-meta', {
              defaultValue: '{{degree}} · {{state}} · {{program}}',
              degree: school.degree,
              state: school.state,
              program,
            })}
          </p>
          {school.active ? null : (
            <p className="medapp-meta">{t('lists-item-inactive', { defaultValue: 'No longer listed' })}</p>
          )}
        </div>
        <div className="medapp-item__actions">
          <MedIconButton
            ref={triggerRef}
            icon={MoreHorizontal}
            label={t('lists-item-actions', { defaultValue: 'Actions for {{name}}', name: school.shortName })}
            aria-haspopup="menu"
            aria-expanded={menu}
            disabled={busy}
            onClick={() => setMenu((v) => !v)}
          />
          <AnchoredMenu
            open={menu}
            onClose={() => setMenu(false)}
            anchorRef={triggerRef}
            label={t('lists-item-actions-menu', { defaultValue: 'School actions' })}
            className="w-48"
          >
            <MenuItem
              icon={Pencil}
              onSelect={() => {
                setMenu(false);
                openNote();
              }}
            >
              {item.note
                ? t('lists-item-edit-note', { defaultValue: 'Edit note' })
                : t('lists-item-note-placeholder', { defaultValue: 'Add a note' })}
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
                setBusy(true);
                onRemove().finally(() => setBusy(false));
              }}
            >
              {t('lists-item-remove-menu', { defaultValue: 'Remove from list' })}
            </MenuItem>
          </AnchoredMenu>
        </div>
      </div>
      {editing ? (
        <div className="medapp-stack medapp-item__indent mt-3">
          <MedTextarea
            aria-label={t('lists-item-note', { defaultValue: 'Note on {{name}}', name: school.shortName })}
            placeholder={t('lists-item-note-placeholder', { defaultValue: 'Add a note' })}
            maxLength={LIMITS.note}
            rows={3}
            autoFocus
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commit}
          />
          <div className="flex items-center justify-between gap-3">
            <MedButton variant="tertiary" className="-ms-3" onClick={commit}>
              {t('lists-item-note-done', { defaultValue: 'Done' })}
            </MedButton>
            <p className="medapp-meta">
              {t('lists-item-note-count', {
                defaultValue: '{{n}} of {{max}}',
                n: codePointCount(note),
                max: LIMITS.note,
              })}
            </p>
          </div>
        </div>
      ) : shownNote ? (
        <button type="button" className="medapp-notebtn medapp-item__indent" onClick={openNote}>
          <span className="sr-only">{`${t('lists-item-edit-note', { defaultValue: 'Edit note' })} `}</span>
          {shownNote}
        </button>
      ) : null}
    </div>
  );
}
