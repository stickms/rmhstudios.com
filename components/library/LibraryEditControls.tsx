/**
 * Library admin edit controls.
 *
 * Rendered only for admins, only while edit mode is on. Provides a per-book
 * toolbar (reorder, curate/uncurate, hide/show, edit metadata, delete) and the
 * metadata edit modal. All actions hit the admin API and then ask the page to
 * refresh via `onChanged`. Books that haven't been migrated to object storage
 * yet have no `id`; for those we surface a hint instead of controls.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Pencil, Star, Eye, EyeOff, Trash2 } from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';

async function patchBook(id: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/admin/library/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error ?? 'Update failed.';
}

export function LibraryEditBar({
  book,
  canMoveUp,
  canMoveDown,
  onMove,
  onEdit,
  onChanged,
}: {
  book: LibraryBook;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (dir: -1 | 1) => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation('c-library');
  const [busy, setBusy] = useState(false);

  // Static, not-yet-migrated books can't be managed individually.
  if (!book.id) {
    return (
      <div className="lib-edit__bar lib-edit__bar--static" onClick={(e) => e.preventDefault()}>
        <span className="lib-edit__hint">{t('edit-migrate-first', { defaultValue: 'Migrate to manage' })}</span>
      </div>
    );
  }

  const act = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    const err = await fn().catch(() => 'Action failed.');
    setBusy(false);
    if (err) {
      window.alert(err);
      return;
    }
    onChanged();
  };

  return (
    <div className="lib-edit__bar" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <button
        type="button"
        className="lib-edit__btn"
        disabled={!canMoveUp || busy}
        onClick={() => onMove(-1)}
        aria-label={t('edit-move-up', { defaultValue: 'Move up' })}
        title={t('edit-move-up', { defaultValue: 'Move up' })}
      >
        <ArrowUp size={14} />
      </button>
      <button
        type="button"
        className="lib-edit__btn"
        disabled={!canMoveDown || busy}
        onClick={() => onMove(1)}
        aria-label={t('edit-move-down', { defaultValue: 'Move down' })}
        title={t('edit-move-down', { defaultValue: 'Move down' })}
      >
        <ArrowDown size={14} />
      </button>
      <button
        type="button"
        className="lib-edit__btn"
        onClick={onEdit}
        aria-label={t('edit-metadata', { defaultValue: 'Edit metadata' })}
        title={t('edit-metadata', { defaultValue: 'Edit metadata' })}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className={`lib-edit__btn ${book.curated ? 'is-on' : ''}`}
        disabled={busy}
        onClick={() => act(() => patchBook(book.id!, { official: !book.curated }))}
        aria-label={book.curated ? t('edit-uncurate', { defaultValue: 'Move to community' }) : t('edit-curate', { defaultValue: 'Mark curated' })}
        title={book.curated ? t('edit-uncurate', { defaultValue: 'Move to community' }) : t('edit-curate', { defaultValue: 'Mark curated' })}
      >
        <Star size={14} />
      </button>
      <button
        type="button"
        className="lib-edit__btn"
        disabled={busy}
        onClick={() => act(() => patchBook(book.id!, { hidden: !book.hidden }))}
        aria-label={book.hidden ? t('edit-show', { defaultValue: 'Show' }) : t('edit-hide', { defaultValue: 'Hide' })}
        title={book.hidden ? t('edit-show', { defaultValue: 'Show' }) : t('edit-hide', { defaultValue: 'Hide' })}
      >
        {book.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button
        type="button"
        className="lib-edit__btn lib-edit__btn--danger"
        disabled={busy}
        onClick={() => {
          if (window.confirm(t('edit-delete-confirm', { defaultValue: 'Delete this book permanently?' }))) {
            act(async () => {
              const res = await fetch(`/api/admin/library/${book.id}`, { method: 'DELETE' });
              if (res.ok) return null;
              const data = await res.json().catch(() => ({}));
              return data.error ?? 'Delete failed.';
            });
          }
        }}
        aria-label={t('edit-delete', { defaultValue: 'Delete' })}
        title={t('edit-delete', { defaultValue: 'Delete' })}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function LibraryEditModal({
  book,
  onClose,
  onSaved,
}: {
  book: LibraryBook;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('c-library');
  const [title, setTitle] = useState(book.title);
  const [description, setDescription] = useState(book.description);
  const [curated, setCurated] = useState(Boolean(book.curated));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    if (!book.id) return;
    if (!title.trim()) {
      setError(t('error-title-required', { defaultValue: 'A title is required.' }));
      return;
    }
    setSaving(true);
    setError(null);
    const err = await patchBook(book.id, {
      title: title.trim(),
      description: description.trim(),
      official: curated,
    }).catch(() => 'Update failed.');
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="lib-upload__overlay" role="dialog" aria-modal="true" aria-label={t('edit-metadata', { defaultValue: 'Edit metadata' })} onMouseDown={onClose}>
      <div className="lib-upload" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lib-upload__head">
          <h2 className="lib-upload__title">{t('edit-metadata', { defaultValue: 'Edit metadata' })}</h2>
          <button type="button" className="lib-upload__close" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>×</button>
        </div>
        <div className="lib-upload__fields">
          <label className="lib-upload__label">
            {t('label-title', { defaultValue: 'Title' })}
            <input className="lib-upload__input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <label className="lib-upload__label">
            {t('label-description', { defaultValue: 'Description' })}
            <textarea className="lib-upload__input lib-upload__textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </label>
          <label className="lib-edit__check">
            <input type="checkbox" checked={curated} onChange={(e) => setCurated(e.target.checked)} />
            {t('edit-curated-label', { defaultValue: 'Curated (show in the top section)' })}
          </label>
        </div>
        {error && <p className="lib-upload__error">{error}</p>}
        <div className="lib-upload__actions">
          <button type="button" className="lib-upload__btn" onClick={onClose} disabled={saving}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
          <button type="button" className="lib-upload__btn lib-upload__btn--primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? t('saving', { defaultValue: 'Saving…' }) : t('save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </div>
  );
}
