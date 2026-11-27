import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedButton } from '../../controls/MedButton';
import { MedInput, MedTextarea } from '../../controls/MedField';
import { useArrival } from '@/components/ui/arrive';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { refusalBody } from '@/lib/errors/codes';
import { cn } from '@/lib/utils';
import { IMPORT_ACCEPT, IMPORT_LIMITS } from '../../../engine/import';
import { LIMITS } from '../../../engine/tracker';
import {
  parseMedListImportFileApi,
  parseMedListImportTextApi,
  saveMedListImportApi,
  type MedListDto,
  type MedListImportPreviewRes,
  type MedListImportSaveRes,
} from '../../../medschools.contract';
import { ME_KEY } from '../../../medschools.queries';
import { fileProblem } from '../../tracker/import/model';
import { useAbortOnUnmount } from '../../tracker/import/useAbortOnUnmount';
import { ListImportPreview } from './ListImportPreview';
import { listIndex, listSaveBody, newListNameProblem, summarizeList, toListEditable, type ListEditRow } from './model';

type Stage = 'input' | 'reading' | 'preview' | 'saved';

/** A file the browser will not send: the server's own refusal sentence, so the line is the same either way. */
const localRefusal = (problem: 'unsupported' | 'too-large') =>
  problem === 'too-large'
    ? new HttpError(413, undefined, undefined, { body: refusalBody('MEDSCHOOLS_LIST_IMPORT_TOO_LARGE') })
    : new HttpError(415, undefined, undefined, { body: refusalBody('MEDSCHOOLS_LIST_IMPORT_UNSUPPORTED') });

function ReadingSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-app-border py-4">
          <span className="medapp-skeleton size-10" />
          <span className="medapp-skeleton h-4 w-48" />
        </div>
      ))}
    </div>
  );
}

/**
 * The list import (owner 2026-11-24): a file or pasted text is read by the server into a PREVIEW of school names;
 * nothing is saved until the member presses "Add to list", the view's one ink primary while it is open (R4). Into one
 * list (`list`, from that list's menu) or a new one (`list` null, "Import a new list"), whose name is typed here. The
 * file is held only until it is sent; its bytes, text and name are never stored by the page or the server.
 */
export default function ListImport({
  list,
  onClose,
  onSaved,
}: {
  list: MedListDto | null;
  onClose: () => void;
  /** The lists changed (the page refetches); the view stays on its saved line until it is closed. */
  onSaved?: (res: MedListImportSaveRes) => void;
}) {
  const { t } = useTranslation('medschools');
  const refusal = useRefusalText();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>('input');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MedListImportPreviewRes | null>(null);
  const [rows, setRows] = useState<ListEditRow[]>([]);
  const [name, setName] = useState(() => t('lists-import-new-default', { defaultValue: 'Imported schools' }));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<MedListImportSaveRes | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const abort = useAbortOnUnmount();

  const existing = useMemo(() => listIndex(list), [list]);
  const totals = summarizeList(rows, existing, list?.items.length ?? 0);
  const nameProblem = list ? null : newListNameProblem(name);
  const rowsArrival = useArrival(stage === 'preview');

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
      let res: MedListImportPreviewRes;
      if (file) {
        const body = new FormData();
        body.append('file', file);
        res = await api(parseMedListImportFileApi, { body, signal: controller.signal });
      } else {
        res = await api(parseMedListImportTextApi, { body: { text }, signal: controller.signal });
      }
      setPreview(res);
      setRows(toListEditable(res, existing));
      setStage('preview');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(refusal(e));
      setStage('input');
    }
  };

  const save = async () => {
    // A second press before the first re-render (the button's `loading` disables it from then on) sends nothing.
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      const target = list ? { listId: list.id } : { newList: name };
      const res = await api(saveMedListImportApi, { body: listSaveBody(rows, existing, target) });
      await qc.invalidateQueries({ queryKey: ME_KEY });
      setSaved(res);
      setStage('saved');
      onSaved?.(res);
    } catch (e) {
      setError(refusal(e));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const heading = list
    ? t('lists-import-into-title', { name: list.name, defaultValue: 'Import into {{name}}' })
    : t('lists-import-new-title', { defaultValue: 'Import a new list' });
  const hasInput = file !== null || text.trim().length > 0;

  return (
    <section aria-labelledby="lists-import-heading" className="medapp-panel medapp-panel--padded">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lists-import-heading" className="medapp-h2 min-w-0 break-words">
          {heading}
        </h2>
        {stage !== 'saved' ? (
          <MedButton variant="tertiary" disabled={saving} onClick={onClose}>
            {t('lists-import-cancel', { defaultValue: 'Cancel' })}
          </MedButton>
        ) : null}
      </div>

      {stage === 'input' || stage === 'reading' ? (
        <div className="mt-3">
          <p className="medapp-text">
            {t('lists-import-notice', {
              defaultValue:
                "The file's text is sent to our AI provider to read it. RMH does not keep the file, and nothing is saved until you press Add.",
            })}
          </p>
          <p className="medapp-meta mt-1">
            {t('lists-import-names-only', {
              defaultValue:
                'Only school names are read, with MD-PhD or DO-PhD where your file says so. Everything else is ignored.',
            })}
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
              {t('lists-import-choose', { defaultValue: 'Choose a file' })}
            </MedButton>
            <span className="medapp-meta min-w-0 break-words">
              {file
                ? file.name
                : t('lists-import-accepted', {
                    defaultValue: 'A spreadsheet, Word document, PDF or text file, up to 2 MB',
                  })}
            </span>
            {file ? (
              <MedButton
                type="button"
                variant="tertiary"
                disabled={stage === 'reading'}
                onClick={() => {
                  if (fileInput.current) fileInput.current.value = '';
                  pick(null);
                }}
              >
                {t('lists-import-remove-file', { defaultValue: 'Remove file' })}
              </MedButton>
            ) : null}
          </div>
          <label className="medapp-fieldset mt-4">
            <span className="medapp-label">{t('lists-import-paste-label', { defaultValue: 'Or paste the text' })}</span>
            <MedTextarea
              rows={6}
              value={text}
              maxLength={IMPORT_LIMITS.pasteChars}
              disabled={file !== null || stage === 'reading'}
              placeholder={t('lists-import-paste-placeholder', {
                defaultValue: 'One school per line, e.g. Duke, UCSF, Johns Hopkins MD-PhD',
              })}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <MedButton type="button" loading={stage === 'reading'} disabled={!hasInput} onClick={() => void read()}>
              {t('lists-import-read', { defaultValue: 'Read the schools' })}
            </MedButton>
            {stage === 'reading' ? (
              <MedButton
                type="button"
                variant="tertiary"
                onClick={() => {
                  abort.current?.abort();
                  setStage('input');
                }}
              >
                {t('lists-import-stop', { defaultValue: 'Stop' })}
              </MedButton>
            ) : null}
          </div>
          {stage === 'reading' ? (
            <div role="status" className="mt-4">
              <p className="medapp-meta">
                {t('lists-import-reading', { defaultValue: 'Reading your schools. This can take a minute.' })}
              </p>
              <ReadingSkeleton />
            </div>
          ) : null}
        </div>
      ) : null}

      {stage === 'preview' && preview ? (
        <div className={cn('mt-3', rowsArrival)}>
          {!list ? (
            <label className="medapp-fieldset border-b border-app-border pb-3">
              <span className="medapp-label">{t('lists-import-name-label', { defaultValue: 'List name' })}</span>
              <MedInput
                value={name}
                maxLength={LIMITS.listName * 2}
                aria-invalid={nameProblem !== null || undefined}
                onChange={(e) => setName(e.target.value)}
              />
              {nameProblem === 'empty' ? (
                <span className="medapp-meta">
                  {t('lists-import-name-empty', { defaultValue: 'Give the list a name.' })}
                </span>
              ) : nameProblem === 'long' ? (
                <span className="medapp-meta">
                  {t('lists-import-name-long', {
                    max: LIMITS.listName,
                    defaultValue: 'Use {{max}} characters or fewer.',
                  })}
                </span>
              ) : null}
            </label>
          ) : null}
          {preview.truncated ? (
            <p className="medapp-meta mt-2">
              {t('lists-import-truncated', {
                max: LIMITS.itemsPerList,
                defaultValue: 'The file was long, so only the first part was read (a list holds {{max}} schools).',
              })}
            </p>
          ) : null}
          {preview.dropped > 0 ? (
            <p className="medapp-meta mt-2">
              {t('lists-import-dropped', {
                count: preview.dropped,
                defaultValue_one: '{{count}} name was left out because your file does not contain it.',
                defaultValue_other: '{{count}} names were left out because your file does not contain them.',
                defaultValue: '{{count}} names were left out because your file does not contain them.',
              })}
            </p>
          ) : null}
          <ListImportPreview rows={rows} existing={existing} onRows={setRows} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <MedButton
              variant="primary"
              loading={saving}
              disabled={totals.adding === 0 || totals.overCap || nameProblem !== null}
              onClick={() => void save()}
            >
              {t('lists-import-add', { defaultValue: 'Add to list' })}
            </MedButton>
            <MedButton
              variant="tertiary"
              disabled={saving}
              onClick={() => {
                setStage('input');
                setPreview(null);
                setError(null);
              }}
            >
              {t('lists-import-back', { defaultValue: 'Start over' })}
            </MedButton>
            <p className="medapp-meta min-w-0 flex-1 basis-48" aria-live="polite">
              {totals.overCap
                ? t('lists-import-over-cap', {
                    max: LIMITS.itemsPerList,
                    defaultValue: 'A list holds up to {{max}} schools. Untick some to add the rest.',
                  })
                : totals.adding === 0
                  ? t('lists-import-nothing', { defaultValue: 'Nothing is ticked to add.' })
                  : t('lists-import-summary', {
                      count: totals.adding,
                      defaultValue_one: '{{count}} school will be added.',
                      defaultValue_other: '{{count}} schools will be added.',
                      defaultValue: '{{count}} schools will be added.',
                    })}
            </p>
          </div>
          {preview.remainingToday !== null && preview.dailyCap !== null ? (
            <p className="medapp-meta mt-2">
              {t('lists-import-remaining', {
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
            {t('lists-import-saved', {
              count: saved.added,
              name: saved.list.name,
              defaultValue_one: 'Added {{count}} school to {{name}}.',
              defaultValue_other: 'Added {{count}} schools to {{name}}.',
              defaultValue: 'Added {{count}} schools to {{name}}.',
            })}
          </p>
          {saved.alreadyThere + saved.invalid > 0 ? (
            <p className="medapp-meta mt-1">
              {t('lists-import-saved-rest', {
                there: saved.alreadyThere,
                invalid: saved.invalid,
                defaultValue: 'Already there: {{there}}. Could not be added: {{invalid}}.',
              })}
            </p>
          ) : null}
          <MedButton className="mt-4" onClick={onClose}>
            {t('lists-import-done', { defaultValue: 'Back to my lists' })}
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
