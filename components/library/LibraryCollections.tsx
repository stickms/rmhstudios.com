/**
 * LibraryCollections — the "series / collections" area on the library page.
 *
 * Each collection is shown as a single book-like tile (with an AI-generated cover,
 * or a titled placeholder) rather than a full inline shelf — clicking a tile opens
 * a modal that reveals its member books. A signed-in reader can build their own:
 * create a series, add books they uploaded (admins: any book), reorder/remove,
 * rename, delete, and generate a cover. All mutations go through
 * /api/library/collection(s)* which enforce ownership; this component is controlled
 * by the page (which owns the collection list so the main shelf can hide books that
 * already live in a collection) and calls `onChanged` after each change.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Check, FolderPlus, ImagePlus, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { LibraryBook } from '@/lib/library/library';
import type { CollectionView } from '@/lib/library/collections';

export function LibraryCollections({
  books,
  collections,
  onChanged,
  isAdmin,
  myHandle,
  canCreate,
}: {
  books: LibraryBook[];
  collections: CollectionView[];
  onChanged: () => void | Promise<void>;
  isAdmin: boolean;
  myHandle: string | null;
  canCreate: boolean;
}) {
  const { t } = useTranslation('library');
  const [creating, setCreating] = useState(false);
  const [manage, setManage] = useState(false);
  const [addingTo, setAddingTo] = useState<CollectionView | null>(null);
  const [opened, setOpened] = useState<CollectionView | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

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
      await onChanged();
    }
  }

  async function removeCollection(c: CollectionView) {
    if (!window.confirm(t('collection-delete-confirm', { defaultValue: 'Delete this collection? The books are not deleted.' }))) return;
    const res = await fetch(`/api/library/collection/${c.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) await onChanged();
  }

  async function renameCollection(c: CollectionView) {
    const title = window.prompt(t('collection-rename-prompt', { defaultValue: 'Collection name' }), c.title);
    if (title === null) return;
    const res = await fetch(`/api/library/collection/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (res?.ok) await onChanged();
  }

  async function addBook(c: CollectionView, slug: string) {
    const res = await fetch(`/api/library/collection/${c.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookSlug: slug }),
    }).catch(() => null);
    if (res?.ok) await onChanged();
  }

  async function removeBook(c: CollectionView, slug: string) {
    const res = await fetch(`/api/library/collection/${c.id}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookSlug: slug }),
    }).catch(() => null);
    if (res?.ok) await onChanged();
  }

  async function generateCover(c: CollectionView) {
    setGenerating(c.id);
    const res = await fetch(`/api/library/collection/${c.id}/cover`, { method: 'POST' }).catch(() => null);
    setGenerating(null);
    if (res?.ok) {
      await onChanged();
    } else {
      const err = await res?.json().catch(() => null);
      window.alert(err?.error ?? t('cover-failed', { defaultValue: 'Could not generate a cover.' }));
    }
  }

  if (visible.length === 0 && !canCreate) return null;

  // Live versions of the collections referenced by open modals (so edits reflect).
  const addingLive = addingTo ? collections.find((c) => c.id === addingTo.id) ?? addingTo : null;
  const openedLive = opened ? collections.find((c) => c.id === opened.id) ?? opened : null;

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
        <div className="lib__shelf" role="list">
          {visible.map((c) => (
            <CollectionTile
              key={c.id}
              collection={c}
              manage={manage && c.canEdit}
              generating={generating === c.id}
              onOpen={() => setOpened(c)}
              onAdd={() => setAddingTo(c)}
              onRename={() => renameCollection(c)}
              onDelete={() => removeCollection(c)}
              onCover={() => generateCover(c)}
            />
          ))}
        </div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreate={createCollection} />}
      {openedLive && <ViewModal collection={openedLive} onClose={() => setOpened(null)} />}
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

/** A single collection rendered as a book-like tile that opens to reveal its books. */
function CollectionTile({
  collection: c,
  manage,
  generating,
  onOpen,
  onAdd,
  onRename,
  onDelete,
  onCover,
}: {
  collection: CollectionView;
  manage: boolean;
  generating: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCover: () => void;
}) {
  const { t } = useTranslation('library');
  const count = c.books.length;
  const countLabel = t('book-count', { count, defaultValue: '{{count}} books' });
  // Stop a manage-button click from also opening the collection.
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <div className="lib-book__wrap lib-coll-tile" role="listitem">
      <button
        type="button"
        className="lib-book lib-coll-tile__btn"
        onClick={onOpen}
        aria-label={t('open-collection', { title: c.title, defaultValue: 'Open {{title}}' })}
      >
        <div className="lib-book__3d">
          <span className="lib-coll-tile__stack" aria-hidden="true" />
          <div className={`lib-book__cover ${c.coverUrl ? 'has-cover' : ''}`}>
            <span className="lib-book__edge" aria-hidden="true" />
            {c.coverUrl ? (
              <img className="lib-book__img" src={c.coverUrl} alt={c.title} loading="lazy" decoding="async" />
            ) : (
              <span className="lib-book__title">{c.title}</span>
            )}
            <span className="lib-coll-tile__badge">
              <Layers size={12} aria-hidden="true" /> {count}
            </span>
            {!c.coverUrl && <span className="lib-book__mark">RMH</span>}
            {generating && (
              <span className="lib-coll-tile__gen" aria-hidden="true">
                <Loader2 className="lib-spin" size={22} />
              </span>
            )}
          </div>
        </div>
        <div className="lib-book__meta">
          <p className="lib-book__name">{c.title}</p>
          <p className="lib-book__by">{countLabel}</p>
        </div>
      </button>

      {manage && (
        <div className="lib-collections__group-actions lib-coll-tile__actions">
          <button type="button" className="lib-edit__btn" onClick={stop(onAdd)} title={t('add-books', { defaultValue: 'Add books' })}>
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="lib-edit__btn"
            onClick={stop(onCover)}
            disabled={generating}
            title={c.coverUrl ? t('regenerate-cover', { defaultValue: 'Regenerate cover' }) : t('generate-cover', { defaultValue: 'Generate cover' })}
          >
            <ImagePlus size={15} />
          </button>
          <button type="button" className="lib-edit__btn" onClick={stop(onRename)} title={t('rename', { defaultValue: 'Rename' })}>
            <Pencil size={15} />
          </button>
          <button type="button" className="lib-edit__btn lib-edit__btn--danger" onClick={stop(onDelete)} title={t('delete', { defaultValue: 'Delete' })}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Modal that reveals a collection's member books. */
function ViewModal({ collection: c, onClose }: { collection: CollectionView; onClose: () => void }) {
  const { t } = useTranslation('library');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const by =
    c.owner && (c.owner.handle || c.owner.name) && !c.official
      ? t('collection-by', { who: c.owner.handle ? `@${c.owner.handle}` : c.owner.name, defaultValue: 'by {{who}}' })
      : null;

  return (
    <div className="lib-upload__overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="lib-upload lib-coll-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lib-upload__head">
          <div className="lib-collections__group-titles">
            <h2 className="lib-upload__title">{c.title}</h2>
            {c.description && <p className="lib-collections__group-desc">{c.description}</p>}
            {by && <p className="lib-book__by">{by}</p>}
          </div>
          <button type="button" className="lib-upload__close" onClick={onClose} aria-label={t('close', { defaultValue: 'Close' })}>×</button>
        </div>
        {c.books.length === 0 ? (
          <p className="vibe-hint lib-collections__empty">{t('collection-empty', { defaultValue: 'No books yet.' })}</p>
        ) : (
          <div className="lib__shelf lib-collections__shelf" role="list">
            {c.books.map((b) => (
              <div className="lib-book__wrap" role="listitem" key={`${c.id}-${b.slug}`}>
                <BookCard book={b} onNavigate={onClose} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A compact, non-editable book card (link to the reader). */
function BookCard({ book, onNavigate }: { book: LibraryBook; onNavigate?: () => void }) {
  const { t } = useTranslation('library');
  const style = { '--book-hue': String(book.hue) } as React.CSSProperties;
  return (
    <Link
      to="/library/$slug"
      params={{ slug: book.slug }}
      className="lib-book"
      style={style}
      onClick={onNavigate}
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
