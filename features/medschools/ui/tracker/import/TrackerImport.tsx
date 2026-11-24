import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedButton } from '../../controls/MedButton';
import { MedSelect } from '../../controls/MedSelect';
import { MedTextarea } from '../../controls/MedField';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { refusalBody } from '@/lib/errors/codes';
import { cycleLabelIsolated } from '../../../engine/cycle';
import { IMPORT_ACCEPT, IMPORT_LIMITS } from '../../../engine/import';
import {
  parseMedImportFileApi,
  parseMedImportTextApi,
  saveMedImportApi,
  type MedImportPreviewRes,
  type MedImportSaveRes,
} from '../../../medschools.contract';
import { ME_KEY, trackerQuery } from '../../../medschools.queries';
import { ImportPreview } from './ImportPreview';
import { useAbortOnUnmount } from './useAbortOnUnmount';
import {
  cycleChoices,
  existingIndex,
  fileProblem,
  retarget,
  saveBody,
  summarize,
  toEditable,
  type EditRow,
} from './model';

type Stage = 'input' | 'reading' | 'preview' | 'saved';

/** A file the browser will not send: the server's own refusal sentence, so the line is the same either way. */
const localRefusal = (problem: 'unsupported' | 'too-large') =>
  problem === 'too-large'
    ? new HttpError(413, undefined, undefined, { body: refusalBody('MEDSCHOOLS_IMPORT_TOO_LARGE') })
    : new HttpError(415, undefined, undefined, { body: refusalBody('MEDSCHOOLS_IMPORT_UNSUPPORTED') });

function PreviewSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 border-b border-app-border py-4">
          <span className="medapp-skeleton h-4 w-48" />
          <span className="medapp-skeleton h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * The tracker import (owner 2026-11-23). A file or pasted text is sent to the server, which reads it into a PREVIEW of
 * tracker dates; nothing is saved until the member presses "Add to my tracker" (the view's one ink primary, R4). The file
 * is held here only until it is sent: its bytes, text and name are never stored by the page or the server.
 */
export default function TrackerImport({
  cycleYear,
  onClose,
  onSaved,
}: {
  /** The cycle the tracker page shows: the preview starts there only when the file names no cycle itself. */
  cycleYear: number;
  onClose: () => void;
  /** The tracker changed: the page refetches and shows this cycle. */
  onSaved: (cycleYear: number) => void;
}) {
  const { t } = useTranslation('medschools');
  const refusal = useRefusalText();
  const qc = useQueryClient();
  const now = useMemo(() => new Date(), []);
  const [stage, setStage] = useState<Stage>('input');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MedImportPreviewRes | null>(null);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [cycle, setCycle] = useState(cycleYear);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<MedImportSaveRes | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useAbortOnUnmount();

  const tracker = useQuery({ ...trackerQuery(cycle), enabled: stage === 'preview' });
  const index = useMemo(() => existingIndex(tracker.data, cycle), [tracker.data, cycle]);
  const existingOf = (slug: string, program: 'REG' | 'PHD') => index.get(`${slug}|${program}`);
  const totals = summarize(rows, existingOf, cycle, now);
  // The rows replace the skeleton once the tracker has answered: they fade in (M9).
  const rowsArrival = useArrival(stage === 'preview' && tracker.isSuccess);
  const choices = useMemo(() => {
    const all = cycleChoices(now);
    return all.includes(cycle) ? all : [cycle, ...all];
  }, [now, cycle]);

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    const problem = fileProblem(f);
    if (problem) {
      setError(refusal(localRefusal(problem)));
      if (fileInput.current) fileInput.current.value = '';
      return setFile(null);
    }
    setFile(f);
  };

  const read = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setStage('reading');
    try {
      let res: MedImportPreviewRes;
      if (file) {
        const body = new FormData();
        body.append('file', file);
        res = await api(parseMedImportFileApi, { body, signal: controller.signal });
      } else {
        res = await api(parseMedImportTextApi, { body: { text }, signal: controller.signal });
      }
      setPreview(res);
      setCycle(res.cycleYear);
      setRows(toEditable(res));
      setStage('preview');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(refusal(e));
      setStage('input');
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api(saveMedImportApi, { body: saveBody(rows, existingOf, cycle, now) });
      await qc.invalidateQueries({ queryKey: ME_KEY });
      setSaved(res);
      setStage('saved');
    } catch (e) {
      setError(refusal(e));
    } finally {
      setSaving(false);
    }
  };

  const heading = t('import-title', { defaultValue: 'Import from a file' });
  const hasInput = file !== null || text.trim().length > 0;

  return (
    <section aria-labelledby="import-heading" className="medapp-panel medapp-panel--padded">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="import-heading" className="medapp-h2">
          {heading}
        </h2>
        {stage !== 'saved' ? (
          <MedButton variant="ghost" disabled={saving} onClick={onClose}>
            {t('tracker-cancel', { defaultValue: 'Cancel' })}
          </MedButton>
        ) : null}
      </div>

      {stage === 'input' || stage === 'reading' ? (
        <div className="mt-3">
          <p className="medapp-text">
            {t('import-notice', {
              defaultValue:
                "The file's text is sent to our AI provider to read it. RMH does not keep the file, and nothing is saved until you press Add.",
            })}
          </p>
          <p className="medapp-meta mt-1">
            {t('import-dates-only', { defaultValue: 'Only application dates are read. Essays and notes are ignored.' })}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={IMPORT_ACCEPT}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <MedButton type="button" disabled={stage === 'reading'} onClick={() => fileInput.current?.click()}>
              {t('import-choose', { defaultValue: 'Choose a file' })}
            </MedButton>
            <span className="medapp-meta min-w-0 break-words">
              {file
                ? file.name
                : t('import-accepted', { defaultValue: 'A spreadsheet, Word document, PDF or text file, up to 2 MB' })}
            </span>
            {file ? (
              <MedButton
                type="button"
                variant="ghost"
                disabled={stage === 'reading'}
                onClick={() => {
                  if (fileInput.current) fileInput.current.value = '';
                  pick(null);
                }}
              >
                {t('import-remove-file', { defaultValue: 'Remove file' })}
              </MedButton>
            ) : null}
          </div>
          <label className="medapp-fieldset mt-4">
            <span className="medapp-label">{t('import-paste-label', { defaultValue: 'Or paste the text' })}</span>
            <MedTextarea
              rows={6}
              value={text}
              maxLength={IMPORT_LIMITS.pasteChars}
              disabled={file !== null || stage === 'reading'}
              placeholder={t('import-paste-placeholder', {
                defaultValue: 'School, submitted, secondary received, interview invite',
              })}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MedButton type="button" loading={stage === 'reading'} disabled={!hasInput} onClick={() => void read()}>
              {t('import-read', { defaultValue: 'Read my dates' })}
            </MedButton>
            {stage === 'reading' ? (
              <MedButton
                type="button"
                variant="ghost"
                onClick={() => {
                  abort.current?.abort();
                  setStage('input');
                }}
              >
                {t('import-stop', { defaultValue: 'Stop' })}
              </MedButton>
            ) : null}
          </div>
          {stage === 'reading' ? (
            <div role="status" className="mt-4">
              <p className="medapp-meta">
                {t('import-reading', { defaultValue: 'Reading your dates. This can take a minute.' })}
              </p>
              <PreviewSkeleton />
            </div>
          ) : null}
        </div>
      ) : null}

      {stage === 'preview' && preview ? (
        <div className="mt-3">
          <div className="medapp-form border-b border-app-border pb-3">
            <label className="medapp-fieldset">
              <span className="medapp-label">{t('tracker-cycle-label', { defaultValue: 'Cycle' })}</span>
              <MedSelect
                aria-label={t('tracker-cycle-label', { defaultValue: 'Cycle' })}
                value={String(cycle)}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setCycle(y);
                  setRows(retarget(rows, y, now));
                }}
              >
                {choices.map((y) => (
                  <option key={y} value={y}>
                    {cycleLabelIsolated(y)}
                  </option>
                ))}
              </MedSelect>
            </label>
            <p className="medapp-meta min-w-0 flex-1">
              {preview.cycleFrom === 'dates'
                ? t('import-cycle-dates', { defaultValue: 'Chosen from the dates in your file.' })
                : preview.cycleFrom === 'hint'
                  ? t('import-cycle-hint', { defaultValue: 'Chosen from the cycle your file names.' })
                  : t('import-cycle-default', { defaultValue: 'Your file has no cycle, so this is the current one.' })}
            </p>
          </div>
          {preview.truncated ? (
            <p className="medapp-meta mt-2">
              {t('import-truncated', { defaultValue: 'The file was long, so only the first part was read.' })}
            </p>
          ) : null}
          {preview.dropped > 0 ? (
            <p className="medapp-meta mt-2">
              {t('import-dropped', {
                dropped: preview.dropped,
                defaultValue: '{{dropped}} dates were left out: not in your file, not real, or outside the cycle.',
              })}
            </p>
          ) : null}
          {tracker.isPending ? (
            <PreviewSkeleton />
          ) : tracker.isError ? (
            <div className="py-4">
              <p className="medapp-text" role="alert">
                {t('import-tracker-failed', { defaultValue: 'Could not check your tracker for dates already there.' })}
              </p>
              <MedButton className="mt-2" onClick={() => void tracker.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </MedButton>
            </div>
          ) : (
            <div className={cn(rowsArrival)}>
              <ImportPreview rows={rows} existingOf={existingOf} cycleYear={cycle} now={now} onRows={setRows} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <MedButton
              variant="primary"
              loading={saving}
              disabled={totals.dates === 0 || !tracker.isSuccess}
              onClick={() => void save()}
            >
              {t('import-add', { defaultValue: 'Add to my tracker' })}
            </MedButton>
            <MedButton
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setStage('input');
                setPreview(null);
                setError(null);
              }}
            >
              {t('import-back', { defaultValue: 'Start over' })}
            </MedButton>
            <p className="medapp-meta min-w-0 flex-1" aria-live="polite">
              {totals.dates === 0
                ? t('import-nothing', { defaultValue: 'Nothing is ticked to add.' })
                : t('import-summary', {
                    dates: totals.dates,
                    schools: totals.schools,
                    defaultValue: '{{dates}} dates for {{schools}} schools will be added.',
                  })}
              {totals.replacing > 0
                ? ` ${t('import-summary-replacing', { replacing: totals.replacing, defaultValue: '{{replacing}} will replace a date you have.' })}`
                : ''}
            </p>
          </div>
          {preview.remainingToday !== null && preview.dailyCap !== null ? (
            <p className="medapp-meta mt-2">
              {t('import-remaining', {
                left: preview.remainingToday,
                cap: preview.dailyCap,
                defaultValue: '{{left}} of {{cap}} questions and imports left today.',
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {stage === 'saved' && saved ? (
        <div className="mt-3">
          <p className="medapp-text" role="status">
            {t('import-saved', {
              added: saved.added,
              overwritten: saved.overwritten,
              defaultValue: 'Added {{added}} dates and replaced {{overwritten}}.',
            })}
          </p>
          {saved.unchanged + saved.conflicts + saved.invalid > 0 ? (
            <p className="medapp-meta mt-1">
              {t('import-saved-rest', {
                unchanged: saved.unchanged,
                conflicts: saved.conflicts,
                invalid: saved.invalid,
                defaultValue:
                  '{{unchanged}} were already there, {{conflicts}} kept your date, {{invalid}} could not be added.',
              })}
            </p>
          ) : null}
          <MedButton className="mt-4" onClick={() => onSaved(saved.cycleYear)}>
            {t('import-done', { defaultValue: 'Back to my tracker' })}
          </MedButton>
        </div>
      ) : null}

      {error ? (
        <p className="medapp-text mt-3 text-app-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
