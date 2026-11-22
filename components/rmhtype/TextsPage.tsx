/**
 * RMHType saved texts (s10-05): the member's private library of up to 50 texts to practise, each with its best
 * WPM, run count and a chart of its last 50 runs. App tier: RMHType keeps its own look. The `/rmhtype` layout
 * gates on sign-in.
 *
 * Everything a member wrote here (a title, a body) is rendered in an element with `dir="auto"`. The form checks
 * a text with the pure, zod-free `lib/rmhtype/texts` rules; the server re-checks with its own schema.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LineChart } from '@/components/ui/line-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/lib/toast';
import { HttpError } from '@/lib/http';
import {
  RMHTYPE_TEXTS_KEY,
  createRmhTypeText,
  deleteRmhTypeText,
  rmhTypeTextQuery,
  rmhTypeTextsQuery,
  updateRmhTypeText,
} from '@/lib/rmhtype/rmhtype.queries';
import {
  MAX_TEXTS_PER_MEMBER,
  TEXT_BODY_MAX,
  TEXT_TITLE_MAX,
  normaliseTextBody,
  normaliseTextTitle,
  type TextProblem,
  type TextRunRow,
  type TextSummary,
} from '@/lib/rmhtype/texts';

type TFn = ReturnType<typeof useTranslation>['t'];

/** One sentence for what is wrong with a title; null when it is fine. Literal keys, so the extractor sees each. */
export function titleProblemText(t: TFn, raw: string): string | null {
  const result = normaliseTextTitle(raw);
  if (result.ok) return null;
  return titleProblemFor(t, result.problem);
}

function titleProblemFor(t: TFn, problem: TextProblem): string {
  switch (problem) {
    case 'too-long':
      return t('title-too-long', { defaultValue: 'Keep the title to {{max}} characters.', max: TEXT_TITLE_MAX });
    case 'control-characters':
      return t('title-control', { defaultValue: 'The title has a character that cannot be shown.' });
    default:
      return t('title-empty', { defaultValue: 'Give the text a title.' });
  }
}

/** One sentence for what is wrong with a body; null when it is fine. */
export function bodyProblemText(t: TFn, raw: string): string | null {
  const result = normaliseTextBody(raw);
  if (result.ok) return null;
  switch (result.problem) {
    case 'too-long':
      return t('body-too-long', { defaultValue: 'Keep the text to {{max}} characters.', max: TEXT_BODY_MAX });
    case 'control-characters':
      return t('body-control', { defaultValue: 'The text has a character that cannot be typed.' });
    case 'too-short':
      return t('body-too-short', { defaultValue: 'The text needs at least 20 characters.' });
    default:
      return t('body-empty', { defaultValue: 'Paste or write the text to practise.' });
  }
}

/** The figures on one row: best speed, accuracy, runs and the last run, as small mono figures. */
function Figures({ text }: { text: TextSummary }) {
  const { t } = useTranslation('type-texts');
  const fmt = useLocaleFormat();
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-app-text-muted">
      <span>
        {text.bestWpm === null
          ? t('figure-no-best', { defaultValue: 'No best yet' })
          : t('figure-best', { defaultValue: 'Best {{wpm}} WPM', wpm: text.bestWpm })}
      </span>
      {text.bestAccuracy === null ? null : (
        <span>{t('figure-accuracy', { defaultValue: 'Accuracy {{value}}%', value: text.bestAccuracy })}</span>
      )}
      <span>{t('figure-runs', { defaultValue: 'Runs {{runs}}', runs: text.runs })}</span>
      <span>
        {text.lastRunAt === null
          ? t('figure-never', { defaultValue: 'Not run yet' })
          : t('figure-last-run', {
              defaultValue: 'Last run {{date}}',
              date: fmt.date(new Date(text.lastRunAt), { dateStyle: 'medium' }),
            })}
      </span>
    </p>
  );
}

/** The list: rows on rules, each with its figures and its actions. */
export function TextsList({
  texts,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: {
  texts: TextSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (text: TextSummary) => void;
}) {
  const { t } = useTranslation('type-texts');
  if (texts.length === 0) {
    return (
      <div className="border-t border-app-border py-8">
        <p className="t-heading">{t('empty-title', { defaultValue: 'No saved texts yet' })}</p>
        <p className="mt-1 max-w-prose text-app-text-muted">
          {t('empty-body', {
            defaultValue:
              'Add a paragraph from your field, a speech or a piece of code, and practise it as often as you like. You can also save a pasted custom test from the progress page.',
          })}
        </p>
      </div>
    );
  }
  return (
    <ul className="border-t border-app-border">
      {texts.map((text) => (
        <li key={text.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border py-3">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onSelect(text.id)}
              aria-pressed={text.id === selectedId}
              className="block max-w-full truncate text-start font-medium underline-offset-4 hover:underline aria-pressed:underline"
              dir="auto"
            >
              {text.title}
            </button>
            <Figures text={text} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link to="/rmhtype/solo" search={{ text: text.id }}>
                {t('practise', { defaultValue: 'Practise' })}
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(text.id)}>
              {t('edit', { defaultValue: 'Edit' })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(text)}>
              {t('delete', { defaultValue: 'Delete' })}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The add / edit form: a title and a body, checked as the member types. */
function TextForm({
  initial,
  saving,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; body: string } | null;
  saving: boolean;
  onSubmit: (value: { title: string; body: string }) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('type-texts');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [touched, setTouched] = useState(false);
  const titleProblem = titleProblemText(t, title);
  const bodyProblem = bodyProblemText(t, body);
  const invalid = titleProblem !== null || bodyProblem !== null;

  return (
    <form
      className="flex flex-col gap-3 border-t border-app-border py-6"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (!invalid) onSubmit({ title, body });
      }}
    >
      <h2 className="t-heading">
        {initial ? t('form-edit', { defaultValue: 'Edit text' }) : t('form-new', { defaultValue: 'Add a text' })}
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="rmhtype-text-title" className="text-sm font-medium text-app-text-muted">
          {t('field-title', { defaultValue: 'Title' })}
        </label>
        <Input
          id="rmhtype-text-title"
          dir="auto"
          value={title}
          maxLength={TEXT_TITLE_MAX * 2}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={touched && titleProblem !== null}
          aria-describedby={touched && titleProblem ? 'rmhtype-text-title-error' : undefined}
        />
        {touched && titleProblem ? (
          <p id="rmhtype-text-title-error" className="text-sm text-app-danger">
            {titleProblem}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="rmhtype-text-body" className="text-sm font-medium text-app-text-muted">
          {t('field-body', { defaultValue: 'Text' })}
        </label>
        <Textarea
          id="rmhtype-text-body"
          rows={8}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-invalid={touched && bodyProblem !== null}
          aria-describedby="rmhtype-text-body-hint"
        />
        <p id="rmhtype-text-body-hint" className="font-mono text-xs text-app-text-muted">
          {t('body-hint', {
            defaultValue: '{{used}} of {{max}} characters. Line breaks are kept; tabs become two spaces.',
            used: body.length,
            max: TEXT_BODY_MAX,
          })}
        </p>
        {touched && bodyProblem ? <p className="text-sm text-app-danger">{bodyProblem}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {t('save', { defaultValue: 'Save text' })}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </form>
  );
}

/** The selected text: its words and a chart of its last runs, with the chart's own table view. */
export function TextRuns({ runs }: { runs: TextRunRow[] }) {
  const { t } = useTranslation('type-texts');
  const chartLabels = useMemo(
    () => ({
      showChart: t('chart-show-chart', { defaultValue: 'Show as chart' }),
      showTable: t('chart-show-table', { defaultValue: 'Show as table' }),
      day: t('chart-table-run', { defaultValue: 'Run' }),
      points: t('chart-points', { defaultValue: 'Data points' }),
      seriesSummary: (v: { label: string; first: string; last: string; min: string; max: string }) =>
        t('chart-series-summary', {
          defaultValue: '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
          ...v,
        }),
    }),
    [t],
  );
  if (runs.length === 0) {
    return (
      <p className="max-w-prose text-app-text-muted">
        {t('runs-empty', { defaultValue: 'No runs yet. Practise this text and each run is charted here.' })}
      </p>
    );
  }
  const series = [
    {
      id: 'wpm',
      label: t('series-wpm', { defaultValue: 'Speed in words per minute' }),
      points: runs.map((run, i) => ({ x: String(i + 1), y: run.wpm })),
    },
  ];
  return (
    <div
      style={{
        ['--chart-ink' as string]: 'var(--app-text)',
        ['--chart-ink-2' as string]: 'var(--app-text-muted)',
        ['--chart-rule' as string]: 'var(--app-border)',
      }}
    >
      <LineChart
        series={series}
        label={t('chart-wpm', { defaultValue: 'Your last runs on this text' })}
        labels={chartLabels}
        formatX={(x) => t('run-number', { defaultValue: 'Run {{n}}', n: x })}
      />
    </div>
  );
}

function SelectedText({ textId }: { textId: string }) {
  const { t } = useTranslation('type-texts');
  const query = useQuery(rmhTypeTextQuery(textId));
  const arrival = useArrival(query.data !== undefined);
  if (query.isError) {
    return (
      <div className="border-t border-app-border py-6">
        <p className="text-app-danger">{t('detail-failed', { defaultValue: 'Could not load this text.' })}</p>
        <button type="button" className="mt-2 underline hover:text-app-text" onClick={() => void query.refetch()}>
          {t('retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    );
  }
  if (!query.data) {
    return (
      <div
        className="border-t border-app-border py-6"
        role="status"
        aria-label={t('detail-loading', { defaultValue: 'Loading this text' })}
      >
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  const { text, runs } = query.data;
  return (
    <section className={`border-t border-app-border py-6 ${arrival ?? ''}`} aria-labelledby="rmhtype-text-heading">
      <h2 id="rmhtype-text-heading" className="t-heading" dir="auto">
        {text.title}
      </h2>
      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-sm text-app-text-muted" dir="auto">
        {text.body}
      </p>
      <div className="mt-6">
        <TextRuns runs={runs} />
      </div>
    </section>
  );
}

export default function TextsPage() {
  const { t } = useTranslation('type-texts');
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useQuery(rmhTypeTextsQuery());
  const arrival = useArrival(list.data !== undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<{ kind: 'new' } | { kind: 'edit'; id: string } | null>(null);
  const editing = form?.kind === 'edit' ? form.id : null;
  const editQuery = useQuery(rmhTypeTextQuery(editing ?? '', editing !== null));
  const editData = editQuery.data;
  const texts = list.data?.texts ?? [];
  const atCap = texts.length >= MAX_TEXTS_PER_MEMBER;

  const refresh = () => queryClient.invalidateQueries({ queryKey: RMHTYPE_TEXTS_KEY });
  const failure = (error: unknown) =>
    toast.error(
      error instanceof HttpError && error.status === 409
        ? t('cap-reached', {
            defaultValue: 'You can keep up to {{max}} texts. Delete one to add another.',
            max: MAX_TEXTS_PER_MEMBER,
          })
        : t('save-failed', { defaultValue: 'Could not save the text. Try again.' }),
    );

  const create = useMutation({
    mutationFn: createRmhTypeText,
    onSuccess: (res) => {
      setForm(null);
      setSelectedId(res.text.id);
      toast.success(t('saved', { defaultValue: 'Text saved' }));
      return refresh();
    },
    onError: failure,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; title: string; body: string }) =>
      updateRmhTypeText(v.id, { title: v.title, body: v.body }),
    onSuccess: (res) => {
      setForm(null);
      toast.success(
        res.reset
          ? t('updated-reset', { defaultValue: 'Text changed. Its runs and best were cleared.' })
          : t('updated', { defaultValue: 'Text updated' }),
      );
      return refresh();
    },
    onError: failure,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteRmhTypeText(id),
    onSuccess: (_res, id) => {
      if (selectedId === id) setSelectedId(null);
      toast.success(t('deleted', { defaultValue: 'Text deleted' }));
      return refresh();
    },
    onError: () => toast.error(t('delete-failed', { defaultValue: 'Could not delete the text. Try again.' })),
  });

  async function submitEdit(id: string, stored: string, value: { title: string; body: string }) {
    const next = normaliseTextBody(value.body);
    const changed = !next.ok || next.value !== stored;
    if (changed) {
      const ok = await confirm({
        title: t('confirm-edit-title', { defaultValue: 'Change the text?' }),
        description: t('confirm-edit-body', {
          defaultValue:
            'Changing the words clears this text’s best, its runs and its ghost. Renaming alone keeps them.',
        }),
        confirmLabel: t('confirm-edit-yes', { defaultValue: 'Change and clear' }),
        cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
        danger: true,
      });
      if (!ok) return;
    }
    update.mutate({ id, title: value.title, body: value.body });
  }

  async function askDelete(text: TextSummary) {
    const ok = await confirm({
      title: t('confirm-delete-title', { defaultValue: 'Delete this text?' }),
      description: t('confirm-delete-body', { defaultValue: 'Its runs and its ghost are deleted with it.' }),
      confirmLabel: t('delete', { defaultValue: 'Delete' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
      danger: true,
    });
    if (ok) remove.mutate(text.id);
  }

  return (
    <div className="app-page">
      <RmhTypeHeader backLabel="RMH Type" backHref="/rmhtype" />
      <div className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold" style={{ fontFamily: 'var(--app-font-display)' }}>
              {t('title', { defaultValue: 'Your texts' })}
            </h1>
            <p className="mt-2 max-w-xl text-app-text-muted">
              {t('intro', {
                defaultValue:
                  'Keep up to 50 texts to practise. They are private to you and never reach a board. A text’s best run is kept as a ghost you can race; ghosts share your limit of 500 with the passages you have typed.',
              })}
            </p>
          </div>
          <Button onClick={() => setForm({ kind: 'new' })} disabled={atCap || form !== null}>
            <Plus aria-hidden />
            {t('add', { defaultValue: 'Add a text' })}
          </Button>
        </div>
        {atCap ? (
          <p className="mt-2 text-sm text-app-text-muted">
            {t('cap-note', {
              defaultValue: 'You keep {{max}} texts, the most there is room for.',
              max: MAX_TEXTS_PER_MEMBER,
            })}
          </p>
        ) : null}

        <div className="mt-6">
          {form?.kind === 'new' ? (
            <TextForm
              initial={null}
              saving={create.isPending}
              onSubmit={(v) => create.mutate(v)}
              onCancel={() => setForm(null)}
            />
          ) : null}
          {editing !== null && editData ? (
            <TextForm
              key={editing}
              initial={{ title: editData.text.title, body: editData.text.body }}
              saving={update.isPending}
              onSubmit={(v) => void submitEdit(editing, editData.text.body, v)}
              onCancel={() => setForm(null)}
            />
          ) : null}
          {editing !== null && !editData ? (
            <p role="status" className="py-4 text-app-text-muted">
              {editQuery.isError
                ? t('detail-failed', { defaultValue: 'Could not load this text.' })
                : t('detail-loading', { defaultValue: 'Loading this text' })}
            </p>
          ) : null}

          {list.isError ? (
            <div>
              <p className="text-app-danger">{t('load-failed', { defaultValue: 'Could not load your texts.' })}</p>
              <button type="button" className="mt-2 underline hover:text-app-text" onClick={() => void list.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </button>
            </div>
          ) : list.data === undefined ? (
            <div className="space-y-3" role="status" aria-label={t('loading', { defaultValue: 'Loading your texts' })}>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className={arrival}>
              <TextsList
                texts={texts}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onEdit={(id) => {
                  setSelectedId(id);
                  setForm({ kind: 'edit', id });
                }}
                onDelete={(text) => void askDelete(text)}
              />
            </div>
          )}

          {selectedId !== null ? <SelectedText textId={selectedId} /> : null}
        </div>
      </div>
    </div>
  );
}
