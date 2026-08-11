'use client';

/**
 * The table's notice board — "no game next week", "we're starting an hour late",
 * "read the recap before Wednesday".
 *
 * Pinned notes sort to the top and stay there; everything else is reverse
 * chronological. Anyone signed in can post, pin, edit or remove any note, which
 * is the same rule the rest of the page follows.
 *
 * Three things a note can be, and they are deliberately different:
 *
 * - **Dismissed** — hidden on THIS DEVICE, by anyone, signed in or not. "I have
 *   read this" belongs to the reader, and on a board this small the alternative
 *   (delete it so it stops nagging me) takes the note away from the person who
 *   has not opened the page yet. Restorable, and never a write.
 * - **Deleted** — gone for everyone, and it needs an account.
 * - **Expired** — gone on its own, once the night it was about has passed.
 *   `expiresAt` comes from the session the note is attached to; a pinned note
 *   ignores it, because pinning is an explicit "keep this up".
 */

// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level. Nine modules did this, together putting
// ~36 KB of framer-motion on the critical path of every page.
import { AnimatePresence, m as motion } from 'framer-motion';
import { Check, Megaphone, Pin, PinOff, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AnnouncementDTO } from '@/lib/pf2ecal/types';
import { ANNOUNCEMENT_MAX } from '@/lib/pf2ecal/types';
import { useDismissedAnnouncements } from './dismissed';
import { EASE } from './motion';

const ITEM = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.16 } },
};

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

  const liveIds = useMemo(() => announcements.map((a) => a.id), [announcements]);
  const { dismissed, dismiss, restoreAll } = useDismissedAnnouncements(liveIds);
  // A pinned note is not dismissible: pinning is the table saying "everyone
  // needs to see this", and letting one person hide it locally would quietly
  // defeat the only mechanism they have for insisting.
  const visible = announcements.filter((a) => a.pinned || !dismissed.has(a.id));
  const hiddenCount = announcements.length - visible.length;

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
        <div className="flex shrink-0 items-center gap-1">
          {/* Dismissing is never a one-way door. Without this the only way back
              to a note you tapped past is clearing site data, which is not a
              thing to ask of someone who wanted to tidy a notice board. */}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
              onClick={restoreAll}
            >
              <Undo2 size={14} aria-hidden />
              {t('show-read', {
                defaultValue: 'Show {{count}} read',
                count: hiddenCount,
              })}
            </button>
          )}
          {canEdit && !composing && (
            <button
              type="button"
              className="pf2e-btn pf2e-btn-secondary pf2e-btn-sm"
              onClick={() => setComposing(true)}
            >
              {t('post', { defaultValue: 'Post' })}
            </button>
          )}
        </div>
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

      {visible.length === 0 ? (
        <p className="pf2e-caption">
          {hiddenCount > 0
            ? t('announcements-all-read', { defaultValue: 'You\u2019re caught up.' })
            : canEdit
              ? t('announcements-empty-editor', {
                  defaultValue: 'Nothing posted yet. Use this for schedule changes and reminders.',
                })
              : t('announcements-empty', { defaultValue: 'Nothing posted yet.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {visible.map((announcement) => (
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
                {/* The note gets the full width and the controls share the
                    meta line beneath it.

                    They used to sit BESIDE the text, which was survivable with
                    two icon buttons and not with three: this card lives in a
                    20rem rail on a desktop and the whole screen is 320px on the
                    narrowest phone, so 132px of touch targets left "Starting an
                    hour late next time." wrapping one word per line. The meta
                    line is the right home for them — it is short, it is already
                    there, and nothing on it competes for space. */}
                <p className="pf2e-body whitespace-pre-wrap break-words">{announcement.body}</p>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="pf2e-caption flex min-w-0 flex-wrap items-center gap-x-1.5">
                    {announcement.pinned && (
                      <>
                        <Pin size={11} aria-hidden />
                        <span>{t('pinned', { defaultValue: 'Pinned' })}</span>
                        <span aria-hidden>·</span>
                      </>
                    )}
                    {announcement.automated ? (
                      <>
                        <Sparkles size={11} aria-hidden />
                        <span>
                          {t('posted-by-the-board', { defaultValue: 'Posted automatically' })}
                        </span>
                      </>
                    ) : (
                      <span>
                        {announcement.authorName ?? t('someone', { defaultValue: 'Someone' })}
                      </span>
                    )}
                    <span aria-hidden>·</span>
                    <time dateTime={announcement.createdAt}>
                      {formatPosted(announcement.createdAt, timeZone)}
                    </time>
                  </p>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* Dismiss needs no account — it writes nothing shared.
                        Absent on a pinned note, which the table has said
                        everyone should see. */}
                    {!announcement.pinned && (
                      <button
                        type="button"
                        className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
                        aria-label={t('mark-read', { defaultValue: 'Mark as read on this device' })}
                        onClick={() => dismiss(announcement.id)}
                      >
                        <Check size={15} aria-hidden />
                      </button>
                    )}
                    {canEdit && (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
