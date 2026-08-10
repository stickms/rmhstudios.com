'use client';

/**
 * The table's notice board — "no game next week", "we're starting an hour late",
 * "read the recap before Wednesday".
 *
 * Pinned notes sort to the top and stay there; everything else is reverse
 * chronological. Anyone signed in can post, pin, edit or remove any note, which
 * is the same rule the rest of the page follows.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Megaphone, Pin, PinOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnnouncementDTO } from '@/lib/pf2ecal/types';
import { ANNOUNCEMENT_MAX } from '@/lib/pf2ecal/types';

const ITEM = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.16 } },
};

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/**
 * `Aug 10, 9:18 AM` in the VIEWER's timezone.
 *
 * The zone is passed in rather than left to the runtime. Omitting it means the
 * server formats in its own zone (UTC in production) and the browser formats in
 * the viewer's, so the same timestamp renders as two different strings either
 * side of hydration — React throws the tree away and re-renders it, and until
 * it does the user is looking at a time that is wrong by the whole UTC offset.
 * `timeZone` comes from `useLocalTimeZone`, which deliberately reports the
 * campaign zone until after mount so both passes agree.
 */
function formatPosted(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface AnnouncementsProps {
  announcements: AnnouncementDTO[];
  /** The viewer's timezone, resolved after mount — see `formatPosted`. */
  timeZone: string;
  canEdit: boolean;
  busyIds: Set<string>;
  onPost: (body: string, pinned: boolean) => void;
  onTogglePin: (announcement: AnnouncementDTO) => void;
  onDelete: (announcement: AnnouncementDTO) => void;
  posting: boolean;
}

export function Announcements({
  announcements,
  timeZone,
  canEdit,
  busyIds,
  onPost,
  onTogglePin,
  onDelete,
  posting,
}: AnnouncementsProps) {
  const { t } = useTranslation('r-pf2ecal');
  const [draft, setDraft] = useState('');
  const [pinned, setPinned] = useState(false);
  const [composing, setComposing] = useState(false);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onPost(body, pinned);
    setDraft('');
    setPinned(false);
    setComposing(false);
  };

  return (
    <section
      className="pf2e-card p-4"
      aria-label={t('announcements', { defaultValue: 'Announcements' })}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        {/* `min-w-0` so the heading can shrink and truncate; without it the
            flex child keeps its min-content width and pushes "Post" out of the
            header at 320px. */}
        <h2 className="pf2e-headline flex min-w-0 items-center gap-2">
          <Megaphone size={17} aria-hidden />
          {t('announcements', { defaultValue: 'Announcements' })}
        </h2>
        {canEdit && !composing && (
          <button
            type="button"
            className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm shrink-0"
            onClick={() => setComposing(true)}
          >
            {t('post', { defaultValue: 'Post' })}
          </button>
        )}
      </header>

      <AnimatePresence initial={false}>
        {composing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mb-4 flex flex-col gap-2">
              <label className="pf2e-sr-only" htmlFor="pf2e-announcement">
                {t('announcement', { defaultValue: 'Announcement' })}
              </label>
              <textarea
                id="pf2e-announcement"
                className="pf2e-field"
                rows={3}
                autoFocus
                value={draft}
                maxLength={ANNOUNCEMENT_MAX}
                placeholder={t('announcement-placeholder', {
                  defaultValue: 'Something the table should know…',
                })}
                onChange={(event) => setDraft(event.target.value)}
                // Cmd/Ctrl+Enter submits — the shortcut everyone already has in
                // their fingers from every other composer.
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <label className="pf2e-caption flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(event) => setPinned(event.target.checked)}
                  />
                  {t('pin-to-top', { defaultValue: 'Pin to the top' })}
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
                    onClick={() => {
                      setComposing(false);
                      setDraft('');
                    }}
                  >
                    {t('cancel', { defaultValue: 'Cancel' })}
                  </button>
                  <button
                    type="button"
                    className="pf2e-btn pf2e-btn-primary pf2e-btn-sm"
                    disabled={!draft.trim() || posting}
                    onClick={submit}
                  >
                    {posting
                      ? t('posting', { defaultValue: 'Posting…' })
                      : t('post', { defaultValue: 'Post' })}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {announcements.length === 0 ? (
        <p className="pf2e-caption">
          {canEdit
            ? t('announcements-empty-editor', {
                defaultValue: 'Nothing posted yet. Use this for schedule changes and reminders.',
              })
            : t('announcements-empty', { defaultValue: 'Nothing posted yet.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {announcements.map((announcement) => (
              <motion.li
                key={announcement.id}
                layout="position"
                variants={ITEM}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ duration: 0.2, ease: EASE }}
                className={[
                  'pf2e-card-flat p-3',
                  busyIds.has(announcement.id) ? 'pf2e-pending' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="pf2e-body min-w-0 whitespace-pre-wrap break-words">
                    {announcement.body}
                  </p>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
                        aria-label={
                          announcement.pinned
                            ? t('unpin', { defaultValue: 'Unpin' })
                            : t('pin-to-top', { defaultValue: 'Pin to the top' })
                        }
                        onClick={() => onTogglePin(announcement)}
                      >
                        {announcement.pinned ? (
                          <PinOff size={15} aria-hidden />
                        ) : (
                          <Pin size={15} aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
                        aria-label={t('delete-announcement', {
                          defaultValue: 'Delete announcement',
                        })}
                        onClick={() => onDelete(announcement)}
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
                <p className="pf2e-caption mt-1.5 flex items-center gap-1.5">
                  {announcement.pinned && (
                    <>
                      <Pin size={11} aria-hidden />
                      <span>{t('pinned', { defaultValue: 'Pinned' })}</span>
                      <span aria-hidden>·</span>
                    </>
                  )}
                  <span>
                    {announcement.authorName ?? t('someone', { defaultValue: 'Someone' })}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={announcement.createdAt}>
                    {formatPosted(announcement.createdAt, timeZone)}
                  </time>
                </p>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
