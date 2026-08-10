'use client';

/**
 * The detail surface for one session: the full roster, the notes, your own
 * answer with an optional note, and the edit/cancel/delete controls.
 *
 * View and edit are the same sheet in two modes rather than two sheets, so
 * hitting "Edit" does not close one dialog and open another — the header stays
 * put and the body cross-fades.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarX2, ExternalLink, MapPin, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Availability, Session } from '@/lib/pf2ecal/types';
import { RESPONSE_NOTE_MAX } from '@/lib/pf2ecal/types';
import { AvailabilityPicker, ResponseRoster } from './Availability';
import { Sheet } from './Sheet';
import { SessionForm, formFromSession, type SessionFormValue } from './SessionForm';
import { asExternalUrl, describeSessionTime, formatFullDate } from './format';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface SessionSheetProps {
  session: Session | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeZone: string;
  viewerId: string | null;
  submitting: boolean;
  onRespond: (session: Session, status: Availability | null, note: string | null) => void;
  onSave: (session: Session, payload: Record<string, unknown>) => void;
  onSetCanceled: (session: Session, canceled: boolean) => void;
  onDelete: (session: Session) => void;
}

export function SessionSheet({
  session,
  open,
  onOpenChange,
  timeZone,
  viewerId,
  submitting,
  onRespond,
  onSave,
  onSetCanceled,
  onDelete,
}: SessionSheetProps) {
  const { t } = useTranslation('r-pf2ecal');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SessionFormValue | null>(null);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine =
    session && viewerId ? session.responses.find((r) => r.userId === viewerId) : undefined;

  // Reset the sheet's local state whenever it opens on a different session, so
  // a note typed for last week's game never leaks into this one's field.
  useEffect(() => {
    if (!session) return;
    setEditing(false);
    setConfirmDelete(false);
    setNote(mine?.note ?? '');
    // `mine` is derived from `session`; depending on it too would reset the
    // field mid-typing every time the board refetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, open]);

  if (!session) return null;

  const time = describeSessionTime(session.startsAt, session.endsAt, timeZone);
  const canceled = Boolean(session.canceledAt);
  const locationUrl = asExternalUrl(session.location);

  const startEditing = () => {
    setForm(formFromSession(session, timeZone));
    setEditing(true);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t('edit-session', { defaultValue: 'Edit session' }) : session.title}
      subtitle={formatFullDate(session.startsAt, timeZone)}
      headerAction={
        !editing && viewerId ? (
          <button
            type="button"
            className="pf2e-btn pf2e-btn-ghost pf2e-btn-icon"
            aria-label={t('edit-session', { defaultValue: 'Edit session' })}
            onClick={startEditing}
          >
            <Pencil size={16} aria-hidden />
          </button>
        ) : null
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {editing && form ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: EASE }}
          >
            <SessionForm
              value={form}
              onChange={setForm}
              timeZone={timeZone}
              submitting={submitting}
              submitLabel={t('save-changes', { defaultValue: 'Save changes' })}
              onCancel={() => setEditing(false)}
              onSubmit={(payload) => {
                onSave(session, payload);
                setEditing(false);
              }}
            />

            <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--pf2e-line)' }}>
              <p className="pf2e-mono-label mb-2">
                {t('danger-zone', { defaultValue: 'Danger zone' })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pf2e-btn pf2e-btn-outline pf2e-btn-sm"
                  onClick={() => onSetCanceled(session, !canceled)}
                  disabled={submitting}
                >
                  {canceled ? (
                    <>
                      <RotateCcw size={14} aria-hidden />
                      {t('bring-it-back', { defaultValue: 'Bring it back' })}
                    </>
                  ) : (
                    <>
                      <CalendarX2 size={14} aria-hidden />
                      {t('cancel-this-session', { defaultValue: 'Cancel this session' })}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="pf2e-btn pf2e-btn-ghost pf2e-btn-sm"
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    onDelete(session);
                    onOpenChange(false);
                  }}
                  disabled={submitting}
                >
                  <Trash2 size={14} aria-hidden />
                  {confirmDelete
                    ? t('tap-again-to-delete', { defaultValue: 'Tap again to delete' })
                    : t('delete', { defaultValue: 'Delete' })}
                </button>
              </div>
              <p className="pf2e-caption mt-2">
                {t('cancel-vs-delete', {
                  defaultValue:
                    'Cancelling keeps the session on the board and tells subscribed calendars it is off. Deleting removes it here but leaves it sitting on anyone\u2019s phone who already synced.',
                })}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: EASE }}
            className="flex flex-col gap-5"
          >
            <div>
              <p className="pf2e-title">
                {time.local}{' '}
                {time.reference && <span className="pf2e-muted font-normal">{time.reference}</span>}
              </p>
              {canceled && (
                <p className="pf2e-body mt-1 flex items-center gap-1.5">
                  <CalendarX2 size={14} aria-hidden />
                  {t('session-cancelled', { defaultValue: 'This session is cancelled.' })}
                </p>
              )}
            </div>

            {session.location && (
              <p className="pf2e-body flex items-center gap-2">
                <MapPin size={15} aria-hidden className="shrink-0" />
                {locationUrl ? (
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-w-0 items-center gap-1 hover:underline"
                  >
                    <span className="truncate">{session.location}</span>
                    <ExternalLink size={12} aria-hidden className="shrink-0" />
                  </a>
                ) : (
                  <span className="min-w-0 break-words">{session.location}</span>
                )}
              </p>
            )}

            {session.notes && (
              <div>
                <p className="pf2e-mono-label mb-1.5">{t('notes', { defaultValue: 'Notes' })}</p>
                <p className="pf2e-body whitespace-pre-wrap break-words">{session.notes}</p>
              </div>
            )}

            {viewerId && !canceled && (
              <div>
                <p className="pf2e-mono-label mb-2">
                  {t('can-you-make-it', { defaultValue: 'Can you make it?' })}
                </p>
                <AvailabilityPicker
                  value={(mine?.status as Availability | undefined) ?? null}
                  disabled={submitting}
                  onChange={(next) => onRespond(session, next, note.trim() || null)}
                />
                <label className="pf2e-sr-only" htmlFor="pf2e-response-note">
                  {t('add-a-note', { defaultValue: 'Add a note to your reply' })}
                </label>
                <input
                  id="pf2e-response-note"
                  className="pf2e-field mt-2"
                  value={note}
                  maxLength={RESPONSE_NOTE_MAX}
                  placeholder={t('note-placeholder', {
                    defaultValue: "Optional — 'might be 20 min late'",
                  })}
                  onChange={(event) => setNote(event.target.value)}
                  // The note only means anything attached to a status, so
                  // committing it re-sends the answer already selected. Blur
                  // rather than a Save button: one less control, and the note
                  // is optional garnish, not a decision.
                  onBlur={() => {
                    const trimmed = note.trim() || null;
                    if (mine && trimmed !== (mine.note ?? null)) {
                      onRespond(session, mine.status, trimmed);
                    }
                  }}
                  disabled={!mine || submitting}
                />
                {!mine && (
                  <p className="pf2e-caption mt-1.5">
                    {t('pick-answer-first', {
                      defaultValue: 'Pick an answer first to add a note.',
                    })}
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="pf2e-mono-label mb-2">
                {t('whos-in', { defaultValue: 'Who\u2019s in' })}
              </p>
              <ResponseRoster responses={session.responses} />
            </div>

            {(session.createdByName || session.updatedByName) && (
              <p className="pf2e-caption">
                {session.fromRule
                  ? t('from-standing-schedule', {
                      defaultValue: 'From the standing schedule.',
                    })
                  : session.updatedByName
                    ? t('last-changed-by', {
                        defaultValue: 'Last changed by {{name}}.',
                        name: session.updatedByName,
                      })
                    : t('added-by', {
                        defaultValue: 'Added by {{name}}.',
                        name: session.createdByName,
                      })}
              </p>
            )}

            {!viewerId && (
              <p className="pf2e-caption">
                {t('sign-in-to-reply-or-edit', {
                  defaultValue: 'Sign in to reply or edit this session.',
                })}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
