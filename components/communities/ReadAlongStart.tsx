/**
 * s11-09 — the Read-alongs tab in the mod tools: the community's read-alongs as rows on rules (with the reason a paused
 * one stopped) and "Start a read-along", a dialog where a moderator picks a library book, a start date, a weekday and
 * time in a time zone, and the parts (suggested from the book's table of contents or by pages, each label and page range
 * editable). `EditParts` is the same parts editor, opened from a read-along's page until its first part opens.
 *
 * Member-written text (book titles, part labels) carries `dir="auto"`; text fields carry it too.
 */
import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api, apiQuery } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { isValidTimeZone } from '@/lib/calendar/tz';
import {
  listReadAlongsApi,
  readAlongBooksApi,
  readAlongPlanApi,
  startReadAlongApi,
  updateReadAlongApi,
} from '@/lib/communities/read-along.contract';
import {
  LABEL_MAX,
  MAX_ACTIVE,
  parseTime,
  partsProblem,
  type BookChoiceDTO,
  type PartDraft,
  type ReadAlongPageDTO,
  type ReadAlongSummaryDTO,
} from '@/lib/communities/read-along';

function browserZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z && isValidTimeZone(z) ? z : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** A `YYYY-MM-DD` day in the browser's own calendar, `plusDays` from today. */
function localDay(plusDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The parts as rows: a label and a page range each, editable. A part is removed by choosing fewer parts, not here. */
function PartsEditor({
  parts,
  onChange,
  idPrefix,
}: {
  parts: PartDraft[];
  onChange: (parts: PartDraft[]) => void;
  idPrefix: string;
}) {
  const { t } = useTranslation('read-alongs');
  const patch = (index: number, change: Partial<PartDraft>) =>
    onChange(parts.map((p, i) => (i === index ? { ...p, ...change } : p)));
  return (
    <ol className="flex flex-col">
      {parts.map((p, i) => (
        <li key={i} className="flex flex-col gap-2 border-b border-site-border py-3">
          <Label htmlFor={`${idPrefix}-label-${i}`}>
            {t('part-label', { n: i + 1, defaultValue: 'Part {{n}} label' })}
          </Label>
          <Input
            id={`${idPrefix}-label-${i}`}
            dir="auto"
            value={p.label}
            maxLength={LABEL_MAX}
            onChange={(e) => patch(i, { label: e.target.value })}
          />
          <div className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-start-${i}`}>
                {t('part-start', { n: i + 1, defaultValue: 'Part {{n}} first page' })}
              </Label>
              <Input
                id={`${idPrefix}-start-${i}`}
                type="number"
                min={1}
                value={p.startPage}
                onChange={(e) => patch(i, { startPage: Number(e.target.value) })}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-end-${i}`}>
                {t('part-end', { n: i + 1, defaultValue: 'Part {{n}} last page' })}
              </Label>
              <Input
                id={`${idPrefix}-end-${i}`}
                type="number"
                min={1}
                value={p.endPage}
                onChange={(e) => patch(i, { endPage: Number(e.target.value) })}
              />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The sentence for a parts problem the form can see before it asks the server. */
function useProblemText() {
  const { t } = useTranslation('read-alongs');
  return (problem: ReturnType<typeof partsProblem>): string | null => {
    switch (problem) {
      case 'count':
        return t('problem-count', { defaultValue: 'A read-along has 2 to 20 parts.' });
      case 'label':
        return t('problem-label', { defaultValue: 'Every part needs a short label.' });
      case 'range':
        return t('problem-range', { defaultValue: 'Each part needs a page range inside the book.' });
      case 'order':
        return t('problem-order', { defaultValue: 'The parts must follow each other without overlapping.' });
      default:
        return null;
    }
  };
}

/** Edit the parts of a read-along whose first part has not opened. */
export function EditParts({
  data,
  onClose,
  onSaved,
}: {
  data: ReadAlongPageDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('read-alongs');
  const refusalText = useRefusalText();
  const problemText = useProblemText();
  const ids = useId();
  const [parts, setParts] = useState<PartDraft[]>(
    data.parts.map((p) => ({ label: p.label, startPage: p.startPage, endPage: p.endPage })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    // The book's page count is the server's to check; the shape of the list is checked here first.
    const problem = problemText(partsProblem(parts, Number.MAX_SAFE_INTEGER));
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(updateReadAlongApi, {
        params: { slug: data.communitySlug, id: data.id },
        body: { parts: parts.map((p) => ({ ...p, label: p.label.trim() })) },
      });
      onSaved();
    } catch (err) {
      setError(refusalText.maybe(err) || t('action-failed', { defaultValue: 'Could not do that. Try again.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('edit-title', { defaultValue: 'Edit the parts' })}</DialogTitle>
          <DialogDescription>
            {t('edit-hint', {
              defaultValue: 'The dates stay where they are. You can change the parts until the first one opens.',
            })}
          </DialogDescription>
        </DialogHeader>
        <PartsEditor parts={parts} onChange={setParts} idPrefix={ids} />
        {error && (
          <p className="t-body text-site-danger" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('dialog-cancel', { defaultValue: 'Close' })}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {t('save', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The dialog that starts a read-along. */
function StartDialog({ slug, onClose, onStarted }: { slug: string; onClose: () => void; onStarted: () => void }) {
  const { t } = useTranslation('read-alongs');
  const refusalText = useRefusalText();
  const problemText = useProblemText();
  const fmt = useLocaleFormat();
  const ids = useId();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [book, setBook] = useState<BookChoiceDTO | null>(null);
  const [count, setCount] = useState<number | undefined>(undefined);
  // The suggested parts, until the moderator edits one; choosing another count starts from the suggestion again.
  const [edits, setEdits] = useState<PartDraft[] | null>(null);
  const [startDay, setStartDay] = useState(localDay(1));
  const [weekday, setWeekday] = useState(() => new Date(`${localDay(1)}T12:00:00`).getDay());
  const [time, setTime] = useState('09:00');
  const [timeZone, setTimeZone] = useState(browserZone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const partWord = t('part-word', { defaultValue: 'Part' });

  const books = useQuery({
    ...apiQuery(readAlongBooksApi, { params: { slug }, query: query ? { q: query } : {} }),
    retry: false,
  });
  const plan = useQuery({
    ...apiQuery(readAlongPlanApi, {
      params: { slug },
      query: { doc: book?.slug ?? '', word: partWord, ...(count ? { parts: count } : {}) },
    }),
    enabled: book !== null,
    retry: false,
  });
  const parts = edits ?? plan.data?.parts ?? [];
  const partCount = count ?? plan.data?.parts.length ?? 2;

  const weekdayName = (d: number) =>
    new Intl.DateTimeFormat(fmt.locale, { weekday: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 7 + d)),
    );

  const start = async () => {
    setError(null);
    if (!book) return;
    const problem = problemText(partsProblem(parts, book.pages));
    if (problem) return setError(problem);
    if (parseTime(time) === null) return setError(t('error-time', { defaultValue: 'Choose a time.' }));
    if (!isValidTimeZone(timeZone.trim()))
      return setError(t('error-zone', { defaultValue: 'Use a time zone name such as Europe/London.' }));
    if (!startDay) return setError(t('error-day', { defaultValue: 'Choose a start date.' }));
    setBusy(true);
    try {
      await api(startReadAlongApi, {
        params: { slug },
        body: {
          docSlug: book.slug,
          startDay,
          weekday,
          time,
          timeZone: timeZone.trim(),
          parts: parts.map((p) => ({ ...p, label: p.label.trim() })),
        },
      });
      toast.success(t('started', { defaultValue: 'Read-along started' }));
      onStarted();
    } catch (err) {
      setError(refusalText.maybe(err) || t('action-failed', { defaultValue: 'Could not do that. Try again.' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('start-title', { defaultValue: 'Start a read-along' })}</DialogTitle>
          <DialogDescription>
            {t('start-hint', {
              defaultValue:
                'Pick a library book and a weekly time. Each part gets a discussion thread behind a spoiler warning when it opens.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {book ? (
            <div className="flex items-baseline justify-between gap-3 border-b border-site-border pb-3">
              <p className="t-body font-medium break-words" dir="auto">
                {book.title}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setBook(null);
                  setEdits(null);
                  setCount(undefined);
                }}
              >
                {t('change-book', { defaultValue: 'Change book' })}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQuery(search.trim());
                }}
              >
                <div className="flex flex-1 flex-col gap-1.5">
                  <Label htmlFor={`${ids}-search`}>
                    {t('search-label', { defaultValue: 'Find a book in the library' })}
                  </Label>
                  <Input
                    id={`${ids}-search`}
                    dir="auto"
                    value={search}
                    maxLength={100}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button type="submit" variant="default">
                  {t('search', { defaultValue: 'Search' })}
                </Button>
              </form>
              {books.isError ? (
                <p className="t-body text-site-danger" role="alert">
                  {t('books-failed', { defaultValue: 'Could not load the library.' })}
                </p>
              ) : !books.data ? (
                <Skeleton className="h-10 w-full" />
              ) : books.data.books.length === 0 ? (
                <p className="t-meta">{t('books-empty', { defaultValue: 'No books match.' })}</p>
              ) : (
                <ul className="flex flex-col">
                  {books.data.books.map((b) => (
                    <li key={b.slug} className="border-b border-site-border">
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-baseline justify-between gap-3 py-2 text-start"
                        onClick={() => {
                          setBook(b);
                          setEdits(null);
                          setCount(undefined);
                        }}
                      >
                        <span className="t-body min-w-0 break-words" dir="auto">
                          {b.title}
                        </span>
                        <span className="t-meta shrink-0">
                          {t('pages-count', { n: b.pages, defaultValue: '{{n}} pages' })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {book && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-count`}>{t('count-label', { defaultValue: 'Number of parts' })}</Label>
                <Input
                  id={`${ids}-count`}
                  type="number"
                  min={2}
                  max={plan.data?.maxParts ?? 20}
                  value={partCount}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    if (n >= 2 && n <= (plan.data?.maxParts ?? 20)) {
                      setCount(n);
                      setEdits(null);
                    }
                  }}
                />
                {plan.data && (
                  <p className="t-meta">
                    {plan.data.hasToc
                      ? t('plan-toc', { defaultValue: 'Suggested from the book’s table of contents.' })
                      : t('plan-pages', { defaultValue: 'Suggested as equal page ranges.' })}
                  </p>
                )}
              </div>

              {plan.isError ? (
                <p className="t-body text-site-danger" role="alert">
                  {t('plan-failed', { defaultValue: 'Could not suggest parts for this book.' })}
                </p>
              ) : !plan.data ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <PartsEditor parts={parts} onChange={setEdits} idPrefix={ids} />
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-day`}>{t('start-day', { defaultValue: 'Start date' })}</Label>
                <Input id={`${ids}-day`} type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} />
                <p className="t-meta">
                  {t('start-day-hint', {
                    defaultValue: 'The first part opens on the first chosen weekday on or after this date.',
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-weekday`}>{t('weekday', { defaultValue: 'Weekday' })}</Label>
                <Select id={`${ids}-weekday`} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>
                      {weekdayName(d)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-time`}>{t('time', { defaultValue: 'Time' })}</Label>
                <Input id={`${ids}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-zone`}>{t('zone', { defaultValue: 'Time zone' })}</Label>
                <Input
                  id={`${ids}-zone`}
                  dir="auto"
                  value={timeZone}
                  maxLength={64}
                  autoComplete="off"
                  onChange={(e) => setTimeZone(e.target.value)}
                />
              </div>
            </>
          )}

          {error && (
            <p className="t-body text-site-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('dialog-cancel', { defaultValue: 'Close' })}
          </Button>
          <Button variant="primary" onClick={() => void start()} disabled={busy || !book || !plan.data}>
            {t('start', { defaultValue: 'Start' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The mod tools tab. */
export function ReadAlongStart({ slug }: { slug: string }) {
  const { t } = useTranslation('read-alongs');
  const fmt = useLocaleFormat();
  const queryClient = useQueryClient();
  const options = apiQuery(listReadAlongsApi, { params: { slug } });
  const list = useQuery({ ...options, retry: false });
  const rows: ReadAlongSummaryDTO[] | null = list.data ? list.data.readAlongs : list.isError ? [] : null;
  const arrival = useArrival(rows !== null);
  const [starting, setStarting] = useState(false);
  const activeCount = rows ? rows.filter((r) => r.status === 'active').length : 0;

  const statusText = (r: ReadAlongSummaryDTO) => {
    if (r.status === 'paused')
      return t('status-paused-short', { defaultValue: 'Paused. Open it to see why and resume.' });
    if (r.status === 'done') return t('status-done', { defaultValue: 'Finished' });
    return r.nextOpensAt
      ? t('next-part', { date: fmt.dateTime(r.nextOpensAt), defaultValue: 'Next part opens {{date}}' })
      : t('status-active', { defaultValue: 'Running' });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="t-meta">
          {t('mod-hint', {
            max: MAX_ACTIVE,
            defaultValue:
              'Read a library book together, a part a week, with a discussion thread behind a spoiler warning for each part. Up to {{max}} can run at once.',
          })}
        </p>
        <Button
          variant="default"
          size="sm"
          onClick={() => setStarting(true)}
          disabled={rows === null || activeCount >= (list.data?.maxActive ?? MAX_ACTIVE)}
        >
          {t('start-button', { defaultValue: 'Start a read-along' })}
        </Button>
      </div>

      {rows === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : list.isError ? (
        <p className="t-body text-site-danger" role="alert">
          {t('load-failed', { defaultValue: 'Could not load the read-alongs.' })}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('empty-title', { defaultValue: 'No read-alongs' })}
          description={t('empty-hint', { defaultValue: 'Pick a book from the library and set a weekly pace.' })}
        />
      ) : (
        <ul className={cn('flex flex-col', arrival)}>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 border-b border-site-border py-3">
              <Link
                to="/c/$slug/read/$id"
                params={{ slug, id: r.id }}
                className="t-body font-medium break-words underline"
                dir="auto"
              >
                {r.bookTitle}
              </Link>
              <p className="t-meta">
                {t('part-progress', {
                  opened: r.openedCount,
                  total: r.partCount,
                  defaultValue: '{{opened}} of {{total}} parts opened',
                })}
                {' · '}
                {statusText(r)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {starting && (
        <StartDialog
          slug={slug}
          onClose={() => setStarting(false)}
          onStarted={() => {
            setStarting(false);
            void queryClient.invalidateQueries({ queryKey: options.queryKey });
          }}
        />
      )}
    </div>
  );
}

export default ReadAlongStart;
