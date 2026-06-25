/**
 * LibraryCollections — the "series / collections" area on the library page.
 *
 * Renders every visible collection as its own shelf of books and lets a signed-in
 * reader build their own: create a series, add books they uploaded (admins: any
 * book), reorder/remove, rename or delete. All mutations go through
 * /api/library/collection(s)* which enforce ownership; this component is a thin,
 * optimistic-ish client that re-fetches after each change.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Check, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import type { CollectionView } from '@/lib/library/collections';

export function LibraryCollections({
  books,
  isAdmin,
  myHandle,
  canCreate,
}: {
  books: LibraryBook[];
  isAdmin: boolean;
  myHandle: string | null;
  canCreate: boolean;
}) {
  const { t } = useTranslation('library');
  const [collections, setCollections] = useState<CollectionView[]>([]);
  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState(false);
  const [addingTo, setAddingTo] = useState<CollectionView | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch('/api/library/collections').catch(() => null);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      if (data?.collections) setCollections(data.collections as CollectionView[]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasEditable = collections.some((c) => c.canEdit);

  // Hide empty collections from people who can't edit them; owners still see theirs.
  const visible = collections.filter((c) => c.books.length > 0 || c.canEdit);

  async function createCollection(title: string, description: string) {
    const res = await fetch('/api/library/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    }).catch(() => null);
    setCreating(false);
    if (res?.ok) {
      setManage(true);
      await refresh();
    }
  }

  async function removeCollection(c: CollectionView) {
    if (!window.confirm(t('collection-delete-confirm', { defaultValue: 'Delete this collection? The books are not deleted.' }))) return;
    const res = await fetch(`/api/library/collection/${c.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) await refresh();
  }

  async function renameCollection(c: CollectionView) {
    const title = window.prompt(t('collection-rename-prompt', { defaultValue: 'Collection name' }), c.title);
    if (title === null) return;
    const res = await fetch(`/api/library/collection/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (res?.ok) await refresh();
  }

  async function addBook(c: CollectionView, slug: string) {
    const res = await fetch(`/api/library/collection/${c.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookSlug: slug }),
    }).catch(() => null);
    if (res?.ok) await refresh();
  }

  async function removeBook(c: CollectionView, slug: string) {
    const res = await fetch(`/api/library/collection/${c.id}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookSlug: slug }),
    }).catch(() => null);
    if (res?.ok) await refresh();
  }

  if (visible.length === 0 && !canCreate) return null;

  // The live version of the collection being managed in the add-books modal.
  const addingLive = addingTo ? collections.find((c) => c.id === addingTo.id) ?? addingTo : null;

  return (
    <section className="lib__section lib-collections">
      <div className="lib-collections__head">
        <h2 className="lib__section-title">{t('section-collections', { defaultValue: 'Collections' })}</h2>
        <div className="lib-collections__head-actions">
          {hasEditable && (
            <button
              type="button"
              className={`lib-upload__open ${manage ? 'is-active' : ''}`}
              onClick={() => setManage((m) => !m)}
              aria-pressed={manage}
            >
              <Pencil size={14} aria-hidden="true" />
              <span className="lib-upload__open-label">
                {manage ? t('done', { defaultValue: 'Done' }) : t('manage', { defaultValue: 'Manage' })}
              </span>
            </button>
          )}
          {canCreate && (
            <button type="button" className="lib-upload__open" onClick={() => setCreating(true)}>
              <FolderPlus size={14} aria-hidden="true" />
              <span className="lib-upload__open-label">{t('new-collection', { defaultValue: 'New collection' })}</span>
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="vibe-hint lib-collections__empty">
          {t('no-collections', { defaultValue: 'No collections yet — create one to group books into a series.' })}
        </p>
      ) : (
        visible.map((c) => {
          const editing = manage && c.canEdit;
          return (
            <div className="lib-collections__group" key={c.id}>
              <div className="lib-collections__group-head">
                <div className="lib-collections__group-titles">
                  <h3 className="lib-collections__group-title">{c.title}</h3>
                  {c.description && <p className="lib-collections__group-desc">{c.description}</p>}
                  {c.owner && (c.owner.handle || c.owner.name) && !c.official && (
                    <p className="lib-book__by">
                      {t('collection-by', {
                        who: c.owner.handle ? `@${c.owner.handle}` : c.owner.name,
                        defaultValue: 'by {{who}}',
                      })}
                    </p>
                  )}
                </div>
                {editing && (
                  <div className="lib-collections__group-actions">
                    <button type="button" className="lib-edit__btn" onClick={() => setAddingTo(c)} title={t('add-books', { defaultValue: 'Add books' })}>
                      <Plus size={15} />
                    </button>
                    <button type="button" className="lib-edit__btn" onClick={() => renameCollection(c)} title={t('rename', { defaultValue: 'Rename' })}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" className="lib-edit__btn lib-edit__btn--danger" onClick={() => removeCollection(c)} title={t('delete', { defaultValue: 'Delete' })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {c.books.length === 0 ? (
                <p className="vibe-hint lib-collections__empty">
                  {t('collection-empty', { defaultValue: 'No books yet. Use + to add some.' })}
                </p>
              ) : (
                <div className="lib__shelf lib-collections__shelf" role="list">
                  {c.books.map((b) => (
                    <div className="lib-book__wrap" role="listitem" key={`${c.id}-${b.slug}`}>
                      <BookCard book={b} />
                      {editing && (
                        <button
                          type="button"
                          className="lib-collections__remove"
                          onClick={() => removeBook(c, b.slug)}
                          aria-label={t('remove-from-collection', { defaultValue: 'Remove from collection' })}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {creating && (
        <CreateModal onClose={() => setCreating(false)} onCreate={createCollection} />
      )}
      {addingLive && (
        <AddBooksModal
          collection={addingLive}
          books={books}
          isAdmin={isAdmin}
          myHandle={myHandle}
          onAdd={(slug) => addBook(addingLive, slug)}
          onRemove={(slug) => removeBook(addingLive, slug)}
          onClose={() => setAddingTo(null)}
        />
      )}
    </section>
  );
}

/** A compact, non-editable book card (link to the reader). */
function BookCard({ book }: { book: LibraryBook }) {
  const { t } = useTranslation('library');
  const style = { '--book-hue': String(book.hue) } as React.CSSProperties;
  return (
    <Link
      to="/library/$slug"
      params={{ slug: book.slug }}
      className="lib-book"
      style={style}
      aria-label={t('open-book', { title: book.title, defaultValue: 'Open {{title}}' })}
    >
      <div className="lib-book__3d">
        <div className={`lib-book__cover ${book.coverUrl ? 'has-cover' : ''}`}>
          <span className="lib-book__edge" aria-hidden="true" />
          {book.coverUrl ? (
            <img className="lib-book__img" src={book.coverUrl} alt={book.title} loading="lazy" decoding="async" />
          ) : (
            <span className="lib-book__title">{book.title}</span>
          )}
          {book.pages > 0 && <span className="lib-book__pages-badge">{book.pages.toLocaleString()} pp</span>}
          {!book.coverUrl && <span className="lib-book__mark">RMH</span>}
        </div>
      </div>
      <div className="lib-book__meta">
        <p className="lib-book__name">{book.title}</p>
      </div>
    </Link>
  );
}

/** Small modal to name + describe a new collection. */
function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (title: string, description: string) => void }) {
  const { t } = useTranslation('library');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lib-upload__overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="lib-upload" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="lib-upload__head">
          <h2 className="lib-upload__title">{t('new-collection', { defaultValue: 'New collection' })}</h2>
          <button type="button" className="lib-upload__close" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>×</button>
        </div>
        <div className="lib-upload__fields">
          <label className="lib-upload__label">
            {t('label-title', { defaultValue: 'Title' })}
            <input
              className="lib-upload__input"
              value={title}
              maxLength={120}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('collection-title-placeholder', { defaultValue: 'e.g. My reading list' })}
            />
          </label>
          <label className="lib-upload__label">
            {t('label-description', { defaultValue: 'Description' })}
            <textarea
              className="lib-upload__input lib-upload__textarea"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('collection-desc-placeholder', { defaultValue: 'Optional' })}
            />
          </label>
        </div>
        <div className="lib-upload__actions">
          <button type="button" className="lib-upload__btn" onClick={onClose}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className="lib-upload__btn lib-upload__btn--primary"
            onClick={() => onCreate(title.trim(), description.trim())}
            disabled={!title.trim()}
          >
            {t('create', { defaultValue: 'Create' })}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal to add/remove books to a collection from the viewer's own books (all, for admins). */
function AddBooksModal({
  collection,
  books,
  isAdmin,
  myHandle,
  onAdd,
  onRemove,
  onClose,
}: {
  collection: CollectionView;
  books: LibraryBook[];
  isAdmin: boolean;
  myHandle: string | null;
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('library');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inCollection = useMemo(() => new Set(collection.books.map((b) => b.slug)), [collection.books]);
  // Candidates: your own uploads (matched by handle), or every book for admins.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return books
      .filter((b) => isAdmin || (myHandle && b.uploadedBy?.handle === myHandle))
      .filter((b) => !q || b.title.toLowerCase().includes(q));
  }, [books, isAdmin, myHandle, query]);

  return (
    <div className="lib-upload__overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="lib-upload" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lib-upload__head">
          <h2 className="lib-upload__title">{t('add-to-collection', { name: collection.title, defaultValue: 'Add to “{{name}}”' })}</h2>
          <button type="button" className="lib-upload__close" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>×</button>
        </div>
        <input
          className="lib-upload__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search-your-books', { defaultValue: 'Search your books…' })}
        />
        <ul className="lib-collections__picker">
          {candidates.length === 0 ? (
            <li className="lib-collections__picker-empty">
              {t('no-books-to-add', { defaultValue: 'No books to add. Upload some first.' })}
            </li>
          ) : (
            candidates.map((b) => {
              const added = inCollection.has(b.slug);
              return (
                <li key={b.slug} className="lib-collections__picker-row">
                  <span className="lib-collections__picker-title">{b.title}</span>
                  <button
                    type="button"
                    className={`lib-collections__picker-btn${added ? ' is-added' : ''}`}
                    onClick={() => (added ? onRemove(b.slug) : onAdd(b.slug))}
                  >
                    {added ? <><Check size={14} /> {t('added', { defaultValue: 'Added' })}</> : <><Plus size={14} /> {t('add', { defaultValue: 'Add' })}</>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="lib-upload__actions">
          <button type="button" className="lib-upload__btn lib-upload__btn--primary" onClick={onClose}>
            {t('done', { defaultValue: 'Done' })}
          </button>
        </div>
      </div>
    </div>
  );
}
