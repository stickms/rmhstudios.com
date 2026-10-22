'use client';

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, NotebookPen, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MAX_SAVE_NOTE } from '@/lib/posts-plus/constants';

/**
 * X9 - the private note on a saved item ("why I saved this"), edited inline on
 * /saves. Shown as a quiet one-liner under the row, or an "Add a note" button;
 * clicking opens a textarea in place. Saves on Save / Ctrl+Enter, cancels on Escape.
 */
export function SaveNoteEditor({
  entityType,
  entityId,
  initial,
  onSaved,
}: {
  entityType: string;
  entityId: string;
  initial: string | null;
  /** Lets the list keep its copy in step so a later search sees the new note. */
  onSaved?: (note: string | null) => void;
}) {
  const { t } = useTranslation('f-posts-plus');
  const id = useId();
  const [note, setNote] = useState<string | null>(initial);
  const [draft, setDraft] = useState(initial ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/saves/note', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, note: draft.trim() || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { note: string | null };
      setNote(data.note);
      setDraft(data.note ?? '');
      setEditing(false);
      onSaved?.(data.note);
    } catch {
      toast.error(t('note-save-failed', { defaultValue: 'Could not save the note' }));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(note ?? '');
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 flex w-full items-start gap-1.5 rounded-site-sm px-1 py-0.5 text-start text-xs text-site-text-muted transition-colors hover:text-site-text"
      >
        <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {note ? (
          <span className="min-w-0 whitespace-pre-wrap break-words">{note}</span>
        ) : (
          <span>{t('note-add', { defaultValue: 'Add a note' })}</span>
        )}
        <span className="sr-only">{t('note-edit', { defaultValue: 'Edit note' })}</span>
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <label htmlFor={id} className="sr-only">
        {t('note-label', { defaultValue: 'Private note' })}
      </label>
      <Textarea
        id={id}
        value={draft}
        autoFocus
        rows={2}
        maxLength={MAX_SAVE_NOTE}
        placeholder={t('note-placeholder', {
          defaultValue: 'Why did you save this? Only you can see it.',
        })}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
        }}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="accent" loading={busy} onClick={() => void save()}>
          <Check aria-hidden />
          {t('note-save', { defaultValue: 'Save note' })}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancel}>
          <X aria-hidden />
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
        <span className="ms-auto text-xs tabular-nums text-site-text-dim">
          {draft.length}/{MAX_SAVE_NOTE}
        </span>
      </div>
    </div>
  );
}
