import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { IconButton } from '@/components/ui/icon-button';
import { MenuItem } from '@/components/ui/menu';
import { Textarea } from '@/components/ui/textarea';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { LIMITS, type MilestoneType } from '../../engine/tracker';
import type { TrackerApplicationDto } from '../../medschools.contract';
import { useMedLabels } from '../labels';
import { MilestoneForm } from './MilestoneForm';

type Panel =
  { kind: 'none' } | { kind: 'milestone'; editing?: { type: MilestoneType; date: string } } | { kind: 'notes' };

/**
 * One tracked application, a row on a rule (R3): the school, its degree and program, the milestones as short buttons
 * ("Interview invite, Nov 20" opens the edit form), the notes as text (never HTML), and the actions. Every mutation is
 * a promise the row awaits: it closes a form only after the server has answered and the tracker has been refetched.
 */
export function ApplicationRow({
  app,
  cycleYear,
  sharing,
  onSaveMilestone,
  onRemoveMilestone,
  onSaveNotes,
  onRemove,
}: {
  app: TrackerApplicationDto;
  cycleYear: number;
  /** Whether this cycle shares anonymously: the remove confirmation says shared events go too. */
  sharing: boolean;
  onSaveMilestone: (type: MilestoneType, date: string) => Promise<void>;
  onRemoveMilestone: (type: MilestoneType) => Promise<void>;
  onSaveNotes: (notes: string | null) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const { milestoneLabel, programFilterLabel } = useMedLabels();
  const refusal = useRefusalText();
  const confirm = useConfirm();
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { school } = app;
  const close = () => setPanel({ kind: 'none' });
  const editingType = panel.kind === 'milestone' ? panel.editing?.type : undefined;

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(refusal(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('tracker-remove-title', {
        defaultValue: 'Remove {{school}} from your tracker?',
        school: school.shortName,
      }),
      description: sharing
        ? t('tracker-remove-shared', {
            defaultValue:
              'Its milestones are deleted, and any you shared anonymously are removed from the public pages at once. The public totals follow at the next daily update.',
          })
        : t('tracker-remove-private', { defaultValue: 'Its milestones and notes are deleted.' }),
      confirmLabel: t('tracker-remove', { defaultValue: 'Remove' }),
      danger: true,
    });
    if (ok) await guarded(onRemove);
  };

  return (
    <li className="border-b border-site-border py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-44 flex-1">
          {school.active ? (
            <Link
              to="/rmh-medschool/$slug"
              params={{ slug: school.slug }}
              search={SCHOOL_SEARCH_DEFAULTS}
              className="t-body"
            >
              {school.name}
            </Link>
          ) : (
            <span className="t-body">{school.name}</span>
          )}
          <p className="t-meta m-0">
            {t('tracker-school-meta', {
              defaultValue: '{{degree}} · {{state}} · {{program}}',
              degree: school.degree,
              state: school.state,
              program: programFilterLabel(app.program, school.degree),
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPanel({ kind: 'milestone' })}>
            {t('tracker-add-milestone', { defaultValue: 'Add milestone' })}
          </Button>
          <IconButton
            ref={triggerRef}
            icon={MoreHorizontal}
            label={t('tracker-row-actions', { defaultValue: 'Actions for {{school}}', school: school.shortName })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            showTooltip={false}
            onClick={() => setMenuOpen((v) => !v)}
          />
          <AnchoredMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
            label={t('tracker-row-menu', { defaultValue: 'School actions' })}
            className="w-44"
          >
            <MenuItem
              icon={Pencil}
              onSelect={() => {
                setMenuOpen(false);
                setNotes(app.notes ?? '');
                setPanel({ kind: 'notes' });
              }}
            >
              {t('tracker-edit-notes', { defaultValue: 'Edit notes' })}
            </MenuItem>
            <MenuItem
              icon={Trash2}
              tone="danger"
              onSelect={() => {
                setMenuOpen(false);
                void remove();
              }}
            >
              {t('tracker-remove', { defaultValue: 'Remove' })}
            </MenuItem>
          </AnchoredMenu>
        </div>
      </div>

      {app.milestones.length > 0 ? (
        <ul className="m-0 mt-1 -ms-3 flex list-none flex-wrap gap-x-1 gap-y-0 p-0">
          {app.milestones.map((m) => {
            const label = t('tracker-milestone-line', {
              defaultValue: '{{type}}, {{date}}',
              type: milestoneLabel(m.type),
              date: formatUtcDay(m.date, locale),
            });
            return (
              <li key={m.type}>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t('tracker-milestone-edit', { defaultValue: 'Edit {{milestone}}', milestone: label })}
                  onClick={() => setPanel({ kind: 'milestone', editing: m })}
                >
                  {label}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {app.notes && panel.kind !== 'notes' ? <p className="t-meta m-0 mt-2 whitespace-pre-wrap">{app.notes}</p> : null}

      {panel.kind === 'milestone' ? (
        <MilestoneForm
          key={panel.editing?.type ?? 'new'}
          cycleYear={cycleYear}
          existing={app.milestones}
          {...(panel.editing ? { editing: panel.editing } : {})}
          onSave={async (type, date) => {
            await onSaveMilestone(type, date);
            close();
          }}
          {...(editingType
            ? {
                onRemove: async () => {
                  await onRemoveMilestone(editingType);
                  close();
                },
              }
            : {})}
          onCancel={close}
        />
      ) : null}

      {panel.kind === 'notes' ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void guarded(async () => {
              await onSaveNotes(notes.trim() ? notes : null);
              close();
            });
          }}
        >
          <Textarea
            aria-label={t('tracker-notes-label', { defaultValue: 'Notes' })}
            maxLength={LIMITS.trackerNotes}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={busy}>
              {t('tracker-save', { defaultValue: 'Save' })}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              {t('tracker-cancel', { defaultValue: 'Cancel' })}
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="t-meta m-0 mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
