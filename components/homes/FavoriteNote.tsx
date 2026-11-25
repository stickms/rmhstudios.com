/**
 * Your private note on a saved listing (s12 10). Shown as plain text with an "Edit" control; editing is inline and
 * saves on blur or Enter (Shift+Enter adds a line, Escape puts the old note back). The note is only ever yours: the
 * server reads and writes the caller's own favourite row, and it is rendered as text, never as HTML.
 */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, StickyNote } from 'lucide-react';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { NOTE_MAX, normalizeNote } from '@/lib/homes/compare';
import { setHomeFavoriteNoteApi } from '@/lib/homes/compare.contract';

interface FavoriteNoteProps {
  listingId: string;
  /** The saved note, or null when there is none. */
  note: string | null;
  /** Called with the stored note (null when it was cleared) after a save. */
  onChange?: (note: string | null) => void;
  className?: string;
}

export function FavoriteNote({ listingId, note, onChange, className }: FavoriteNoteProps) {
  const { t } = useTranslation('homes-compare');
  const refusalText = useRefusalText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');
  const [busy, setBusy] = useState(false);
  // Escape ends the edit without saving; the blur that follows must not write the draft back.
  const cancelled = useRef(false);
  const hintId = `note-hint-${listingId}`;

  const focusEnd = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function begin() {
    cancelled.current = false;
    setDraft(note ?? '');
    setEditing(true);
  }

  async function save() {
    if (busy) return;
    const next = normalizeNote(draft);
    if (next === (note ?? null)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const res = await api(setHomeFavoriteNoteApi, { params: { id: listingId }, body: { note: draft } });
      onChange?.(res.note);
      setEditing(false);
    } catch (err) {
      toast.error(refusalText.maybe(err) ?? t('note-save-failed', { defaultValue: 'Could not save your note' }));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className={className}>
        <Textarea
          ref={focusEnd}
          dir="auto"
          value={draft}
          maxLength={NOTE_MAX}
          disabled={busy}
          aria-label={t('note-field', { defaultValue: 'Your private note on this home' })}
          aria-describedby={hintId}
          className="min-h-16"
          autosize
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (cancelled.current) return;
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
        <p id={hintId} className="t-meta mt-1 flex flex-wrap justify-between gap-x-3">
          <span>{t('note-hint', { defaultValue: 'Only you can see this. Enter saves.' })}</span>
          <span>
            {t('note-count', { defaultValue: '{{count}} of {{max}}', count: [...draft].length, max: NOTE_MAX })}
          </span>
        </p>
      </div>
    );
  }

  if (!note) {
    return (
      <div className={className}>
        <Button type="button" variant="ghost" size="sm" onClick={begin}>
          <StickyNote aria-hidden />
          {t('note-add', { defaultValue: 'Add a note' })}
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="t-label">{t('note-label', { defaultValue: 'Your note' })}</p>
      <p dir="auto" className="t-body mt-0.5 whitespace-pre-wrap break-words">
        {note}
      </p>
      <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={begin}>
        <Pencil aria-hidden />
        {t('note-edit', { defaultValue: 'Edit note' })}
      </Button>
    </div>
  );
}
