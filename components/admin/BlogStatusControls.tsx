/**
 * The Log editor's state actions (s03-05, FR-1). A new, draft or scheduled Log offers Save draft, Schedule and
 * Publish; a published Log offers Update and Unpublish. Publish (or Update on a live Log) is the one ink primary;
 * the others are secondary. Schedule only opens the time field (`ScheduleControl`, rendered by the editor); the
 * time is committed from there.
 */
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { formatUtcMinute, type LogStatus } from '@/lib/blog/publication';

export interface BlogStatusControlsProps {
  /** The Log's saved state; null for a Log that has not been saved yet. */
  status: LogStatus | null;
  /** ISO instant a scheduled Log goes out. */
  publishAt: string | null;
  /** Nothing to save yet (no text). */
  disabled: boolean;
  /** Which action is in flight, if any. */
  busy: LogStatus | 'unpublish' | null;
  scheduleOpen: boolean;
  onSave: (target: LogStatus) => void;
  onUnpublish: () => void;
  onToggleSchedule: () => void;
}

export function BlogStatusControls({
  status,
  publishAt,
  disabled,
  busy,
  scheduleOpen,
  onSave,
  onUnpublish,
  onToggleSchedule,
}: BlogStatusControlsProps) {
  const { t } = useTranslation('log-drafts');
  const live = status === 'published';
  const inFlight = busy !== null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="t-meta hidden md:inline" role="status">
        {status === 'scheduled' && publishAt
          ? t('status-scheduled-for-long', {
              defaultValue: 'Scheduled for {{time}} UTC',
              time: formatUtcMinute(publishAt),
            })
          : status === 'published'
            ? t('status-published', {
                defaultValue: 'Published',
              })
            : status === 'draft'
              ? t('status-draft', {
                  defaultValue: 'Draft',
                })
              : t('status-unsaved', {
                  defaultValue: 'Not saved yet',
                })}
      </span>
      {live ? (
        <>
          <Button type="button" size="sm" disabled={inFlight} loading={busy === 'unpublish'} onClick={onUnpublish}>
            {t('unpublish', {
              defaultValue: 'Unpublish',
            })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={disabled || inFlight}
            loading={busy === 'published'}
            onClick={() => onSave('published')}
          >
            {t('update', {
              defaultValue: 'Update',
            })}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            disabled={disabled || inFlight}
            loading={busy === 'draft'}
            onClick={() => onSave('draft')}
          >
            {t('save-draft', {
              defaultValue: 'Save draft',
            })}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || inFlight}
            aria-expanded={scheduleOpen}
            aria-controls="log-schedule"
            onClick={onToggleSchedule}
          >
            <CalendarClock aria-hidden />
            {status === 'scheduled'
              ? t('reschedule', {
                  defaultValue: 'Reschedule',
                })
              : t('schedule', {
                  defaultValue: 'Schedule',
                })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={disabled || inFlight}
            loading={busy === 'published'}
            onClick={() => onSave('published')}
          >
            {t('publish', {
              defaultValue: 'Publish',
            })}
          </Button>
        </>
      )}
    </div>
  );
}
