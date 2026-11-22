import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryBook } from '@/lib/library/library';
import type { ReaderSyncControls } from '@/lib/library/reader-store';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import '@/components/library/library.css';

type ReaderChapter = {
  title: string;
  page: number;
  depth: number;
};

export function ReaderDetails({
  book,
  numPages,
  chapters,
  portalContainer,
  returnFocus,
  onJump,
  onClose,
  sync,
}: {
  book: LibraryBook;
  numPages: number;
  chapters: ReaderChapter[];
  portalContainer?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  onJump: (page: number) => void;
  onClose: () => void;
  /** Present for a signed-in reader: the place-and-notes sync controls. */
  sync?: ReaderSyncControls;
}) {
  const { t } = useTranslation('c-library');
  const { t: ts } = useTranslation('reading-sync');
  // Removing the synced copy asks first, in place.
  const [removal, setRemoval] = useState<'idle' | 'confirming' | 'working' | 'done' | 'failed'>('idle');
  const uploader = book.uploadedBy?.name || (book.uploadedBy?.handle ? `@${book.uploadedBy.handle}` : null);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
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
            <button
              type="button"
              className="lib-reader__details-close"
              aria-label={t('close-book-details', {
                defaultValue: 'Close book details',
              })}
            >
              <X size={18} />
            </button>
          </Dialog.Close>
          <div className="lib-reader__details-cover">
            {book.coverUrl ? (
              <img src={book.coverUrl} alt="" />
            ) : (
              <div
                className="lib-reader__details-fallback"
                style={
                  {
                    '--book-hue': String(book.hue),
                  } as React.CSSProperties
                }
              >
                <BookOpen size={18} aria-hidden="true" />
                <strong>{book.title}</strong>
              </div>
            )}
          </div>
          <p className="lib-reader__details-kicker">
            {book.curated || book.source === 'static'
              ? t('rmh-archive', {
                  defaultValue: 'RMH Studios archive',
                })
              : t('community-library', {
                  defaultValue: 'Community library',
                })}
          </p>
          <Dialog.Title asChild>
            <h2>{book.title}</h2>
          </Dialog.Title>
          {book.description && (
            <Dialog.Description className="lib-reader__details-description">{book.description}</Dialog.Description>
          )}
          {uploader && (
            <p className="lib-reader__details-uploader">
              {t('added-by', {
                uploader,
                defaultValue: 'Added by {{uploader}}',
              })}
            </p>
          )}
          <dl className="lib-reader__details-meta">
            <div>
              <dt>
                {t('length', {
                  defaultValue: 'Length',
                })}
              </dt>
              <dd>
                {t('page-count', {
                  count: numPages || book.pages,
                  defaultValue: '{{count}} pages',
                })}
              </dd>
            </div>
            <div id="reader-details-format">
              <dt>
                {t('format', {
                  defaultValue: 'Format',
                })}
              </dt>
              <dd>{book.format.toUpperCase()}</dd>
            </div>
          </dl>
          {chapters.length > 0 && (
            <nav
              className="lib-reader__details-toc"
              aria-label={t('table-of-contents', {
                defaultValue: 'Table of contents',
              })}
            >
              <h3>
                {t('contents', {
                  defaultValue: 'Contents',
                })}
              </h3>
              {chapters.map((chapter, index) => (
                <button
                  type="button"
                  key={`${chapter.page}-${index}`}
                  style={{
                    paddingInlineStart: `${12 + chapter.depth * 12}px`,
                  }}
                  onClick={() => {
                    onJump(chapter.page);
                    onClose();
                  }}
                >
                  <span>{chapter.title}</span>
                  <small>{chapter.page}</small>
                </button>
              ))}
            </nav>
          )}
          {sync?.available && (
            <section className="mt-8 border-t border-site-border pt-5" aria-labelledby="reader-sync-heading">
              <h3 id="reader-sync-heading" className="t-label">
                {ts('sync-heading', { defaultValue: 'Place and notes' })}
              </h3>
              <div className="mt-3 flex items-center justify-between gap-4">
                <span id="reader-sync-off-label" className="t-body text-site-text">
                  {ts('device-only-label', {
                    defaultValue: 'Keep my place and notes on this device only',
                  })}
                </span>
                <Switch
                  checked={sync.off}
                  onCheckedChange={sync.setOff}
                  aria-labelledby="reader-sync-off-label"
                  aria-describedby="reader-sync-off-hint"
                />
              </div>
              <p id="reader-sync-off-hint" className="t-meta mt-2">
                {sync.off
                  ? ts('device-only-on-hint', {
                      defaultValue: 'Nothing from this book is sent to your account from this device.',
                    })
                  : ts('device-only-off-hint', {
                      defaultValue: 'Your place, bookmarks and notes follow you to your other devices.',
                    })}
              </p>
              <div className="mt-4">
                {removal === 'confirming' || removal === 'working' ? (
                  <div role="group" aria-labelledby="reader-sync-remove-question">
                    <p id="reader-sync-remove-question" className="t-body text-site-text">
                      {ts('remove-question', {
                        defaultValue:
                          'Remove the synced place and notes for this book from your account? Copies on your devices stay, and syncing turns off on this one.',
                      })}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="danger"
                        disabled={removal === 'working'}
                        onClick={async () => {
                          setRemoval('working');
                          setRemoval((await sync.removeSynced()) ? 'done' : 'failed');
                        }}
                      >
                        {ts('remove-confirm', { defaultValue: 'Remove' })}
                      </Button>
                      <Button variant="ghost" disabled={removal === 'working'} onClick={() => setRemoval('idle')}>
                        {ts('remove-cancel', { defaultValue: 'Cancel' })}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="default" onClick={() => setRemoval('confirming')}>
                    {ts('remove-synced', { defaultValue: 'Remove synced place and notes' })}
                  </Button>
                )}
                <p role="status" aria-live="polite" className="t-meta mt-2">
                  {removal === 'done'
                    ? ts('remove-done', { defaultValue: 'Removed from your account.' })
                    : removal === 'failed'
                      ? ts('remove-failed', { defaultValue: 'Could not remove them. Try again.' })
                      : null}
                </p>
              </div>
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
