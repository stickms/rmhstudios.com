import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/icon-button';
import { Textarea } from '@/components/ui/textarea';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { LIMITS } from '../../engine/tracker';
import type { MedListItemDto } from '../../medschools.contract';
import { SchoolCrest } from '../SchoolCrest';
import { useMedLabels } from '../labels';

/** Characters as a person counts them (code points), the same unit the server's cap uses. */
export const codePointCount = (s: string): number => [...s].length;

/**
 * One saved school on a rule: the school (a link while it is listed), `degree · state`, the program, an inline note
 * saved on blur, and remove. A school that was deactivated stays in the list, as plain text with a line saying so,
 * because a link would 404.
 */
export function ListItemRow({
  item,
  onSaveNote,
  onRemove,
}: {
  item: MedListItemDto;
  onSaveNote: (note: string | null) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);
  const school = item.school;
  const program =
    item.program === 'ANY'
      ? t('program-either', { defaultValue: 'Either program' })
      : programFilterLabel(item.program, school.degree);

  const commit = () => {
    const next = note.trim() ? note : null;
    if (next === (item.note ?? null)) return;
    setBusy(true);
    onSaveNote(next).finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <span className="mt-px">
          <SchoolCrest slug={school.slug} name={school.shortName} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {school.active ? (
            <Link
              to="/rmh-medschool/$slug"
              params={{ slug: school.slug }}
              search={SCHOOL_SEARCH_DEFAULTS}
              className="t-body"
            >
              {school.name}
            </Link>
          ) : (
            <span className="t-body">{school.name}</span>
          )}
          <p className="t-meta m-0">
            {t('lists-item-meta', {
              defaultValue: '{{degree}} · {{state}} · {{program}}',
              degree: school.degree,
              state: school.state,
              program,
            })}
          </p>
          {school.active ? null : (
            <p className="t-meta m-0">{t('lists-item-inactive', { defaultValue: 'No longer listed' })}</p>
          )}
        </div>
        <IconButton
          icon={Trash2}
          label={t('lists-item-remove', { defaultValue: 'Remove {{name}}', name: school.shortName })}
          showTooltip={false}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onRemove().finally(() => setBusy(false));
          }}
        />
      </div>
      <Textarea
        aria-label={t('lists-item-note', { defaultValue: 'Note on {{name}}', name: school.shortName })}
        placeholder={t('lists-item-note-placeholder', { defaultValue: 'Add a note' })}
        maxLength={LIMITS.note}
        rows={1}
        value={note}
        disabled={busy}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commit}
      />
      {note.length > 0 ? (
        <p className="t-meta m-0 text-end">
          {t('lists-item-note-count', {
            defaultValue: '{{n}} of {{max}}',
            n: codePointCount(note),
            max: LIMITS.note,
          })}
        </p>
      ) : null}
    </div>
  );
}
