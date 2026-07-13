import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LibraryBook } from '@/lib/library/library';

type ReaderChapter = { title: string; page: number; depth: number };

export function ReaderDetails({
  book,
  numPages,
  chapters,
  portalContainer,
  returnFocus,
  onJump,
  onClose,
}: {
  book: LibraryBook;
  numPages: number;
  chapters: ReaderChapter[];
  portalContainer?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  onJump: (page: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('c-library');
  const uploader = book.uploadedBy?.name || (book.uploadedBy?.handle ? `@${book.uploadedBy.handle}` : null);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="lib-reader__details-overlay" />
        <Dialog.Content
          className="lib-reader__details"
          aria-describedby={book.description ? undefined : 'reader-details-format'}
          onCloseAutoFocus={(event) => {
            if (!returnFocus) return;
            event.preventDefault();
            returnFocus.focus();
          }}
        >
      <Dialog.Close asChild>
        <button type="button" className="lib-reader__details-close" aria-label={t('close-book-details', { defaultValue: 'Close book details' })}>
          <X size={18} />
        </button>
      </Dialog.Close>
      <div className="lib-reader__details-cover">
        {book.coverUrl ? (
          <img src={book.coverUrl} alt="" />
        ) : (
          <div className="lib-reader__details-fallback" style={{ '--book-hue': String(book.hue) } as React.CSSProperties}>
            <BookOpen size={18} aria-hidden="true" />
            <strong>{book.title}</strong>
          </div>
        )}
      </div>
      <p className="lib-reader__details-kicker">
        {book.curated || book.source === 'static'
          ? t('rmh-archive', { defaultValue: 'RMH Studios archive' })
          : t('community-library', { defaultValue: 'Community library' })}
      </p>
      <Dialog.Title asChild><h2>{book.title}</h2></Dialog.Title>
      {book.description && <Dialog.Description className="lib-reader__details-description">{book.description}</Dialog.Description>}
      {uploader && <p className="lib-reader__details-uploader">{t('added-by', { uploader, defaultValue: 'Added by {{uploader}}' })}</p>}
      <dl className="lib-reader__details-meta">
        <div><dt>{t('length', { defaultValue: 'Length' })}</dt><dd>{t('page-count', { count: numPages || book.pages, defaultValue: '{{count}} pages' })}</dd></div>
        <div id="reader-details-format"><dt>{t('format', { defaultValue: 'Format' })}</dt><dd>{book.format.toUpperCase()}</dd></div>
      </dl>
      {chapters.length > 0 && (
        <nav className="lib-reader__details-toc" aria-label={t('table-of-contents', { defaultValue: 'Table of contents' })}>
          <h3>{t('contents', { defaultValue: 'Contents' })}</h3>
          {chapters.map((chapter, index) => (
            <button
              type="button"
              key={`${chapter.page}-${index}`}
              style={{ paddingInlineStart: `${12 + chapter.depth * 12}px` }}
              onClick={() => {
                onJump(chapter.page);
                onClose();
              }}
            >
              <span>{chapter.title}</span><small>{chapter.page}</small>
            </button>
          ))}
        </nav>
      )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
