import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MedButton } from '../controls/MedButton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MedIconButton } from '../controls/MedIconButton';
import { MenuItem } from '@/components/ui/menu';
import { MedTextarea } from '../controls/MedField';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { SCHOOL_SEARCH_DEFAULTS } from '../../engine/search';
import { LIMITS, type MilestoneType } from '../../engine/tracker';
import type { ChanceDto, TrackerApplicationDto } from '../../medschools.contract';
import { useMedLabels } from '../labels';
import { StatusText } from '../status/StatusText';
import { statusOfMilestone } from '../status/status';
import { ChanceLine } from './ChanceLine';
import { MilestoneForm } from './MilestoneForm';
import { StepIcon } from './StepIcon';
import { SilenceLine } from './SilenceLine';

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
  chance,
  onSaveMilestone,
  onRemoveMilestone,
  onSaveNotes,
  onRemove,
}: {
  app: TrackerApplicationDto;
  cycleYear: number;
  /** Whether this cycle shares anonymously: the remove confirmation says shared events go too. */
  sharing: boolean;
  /** This application's invite chance, once loaded; absent while loading or when it failed (the row is whole without it). */
  chance?: ChanceDto | undefined;
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
    <li className="medapp-item">
      <div className="medapp-item__head">
        <div className="medapp-item__title">
          {school.active ? (
            <Link
              to="/med/$slug"
              params={{ slug: school.slug }}
              search={SCHOOL_SEARCH_DEFAULTS}
              className="medapp-name"
            >
              {school.name}
            </Link>
          ) : (
            <span className="medapp-name">{school.name}</span>
          )}
          <p className="medapp-meta">
            {t('tracker-school-meta', {
              defaultValue: '{{degree}} · {{state}} · {{program}}',
              degree: school.degree,
              state: school.state,
              program: programFilterLabel(app.program, school.degree),
            })}
          </p>
        </div>
        <div className="medapp-item__actions">
          <MedIconButton
            ref={triggerRef}
            icon={MoreHorizontal}
            label={t('tracker-row-actions', { defaultValue: 'Actions for {{school}}', school: school.shortName })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          />
          <AnchoredMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={triggerRef}
            label={t('tracker-row-menu', { defaultValue: 'School actions' })}
            className="w-48"
          >
            <MenuItem
              icon={Plus}
              onSelect={() => {
                setMenuOpen(false);
                setPanel({ kind: 'milestone' });
              }}
            >
              {t('tracker-add-milestone', { defaultValue: 'Add milestone' })}
            </MenuItem>
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
        <ul className="medapp-steps">
          {app.milestones.map((m) => {
            const label = t('tracker-milestone-line', {
              defaultValue: '{{type}}, {{date}}',
              type: milestoneLabel(m.type),
              date: formatUtcDay(m.date, locale),
            });
            // Every step has the same shape: its disc, its words (in the status hue when it has one), the date at the end.
            const status = statusOfMilestone(m.type);
            return (
              <li key={m.type}>
                <button
                  type="button"
                  className="medapp-step"
                  aria-label={t('tracker-milestone-edit', { defaultValue: 'Edit {{milestone}}', milestone: label })}
                  onClick={() => setPanel({ kind: 'milestone', editing: m })}
                >
                  <StepIcon type={m.type} />
                  <span className="medapp-step__label">
                    {status ? (
                      <StatusText status={status}>{milestoneLabel(m.type)}</StatusText>
                    ) : (
                      milestoneLabel(m.type)
                    )}
                  </span>
                  <time dateTime={m.date} className="medapp-date">
                    {formatUtcDay(m.date, locale)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-2">
          <MedButton variant="tertiary" className="-ms-3" onClick={() => setPanel({ kind: 'milestone' })}>
            <Plus aria-hidden="true" className="size-4" />
            {t('tracker-add-milestone', { defaultValue: 'Add milestone' })}
          </MedButton>
        </div>
      )}

      <SilenceLine chance={chance} />
      <ChanceLine chance={chance} />

      {app.notes && panel.kind !== 'notes' ? (
        <button
          type="button"
          className="medapp-notebtn"
          onClick={() => {
            setNotes(app.notes ?? '');
            setPanel({ kind: 'notes' });
          }}
        >
          <span className="sr-only">{`${t('tracker-edit-notes', { defaultValue: 'Edit notes' })} `}</span>
          {app.notes}
        </button>
      ) : null}

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
          className="medapp-stack medapp-subrule"
          onSubmit={(e) => {
            e.preventDefault();
            void guarded(async () => {
              await onSaveNotes(notes.trim() ? notes : null);
              close();
            });
          }}
        >
          <MedTextarea
            aria-label={t('tracker-notes-label', { defaultValue: 'Notes' })}
            maxLength={LIMITS.trackerNotes}
            value={notes}
            disabled={busy}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <div className="medapp-actions">
            <MedButton type="submit" loading={busy}>
              {t('tracker-save', { defaultValue: 'Save' })}
            </MedButton>
            <MedButton type="button" variant="tertiary" disabled={busy} onClick={close}>
              {t('tracker-cancel', { defaultValue: 'Cancel' })}
            </MedButton>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="medapp-meta mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}
