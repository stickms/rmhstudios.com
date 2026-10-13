'use client';

/**
 * N6 — community census. Members answer once; results are aggregate-only and are
 * published when a mod closes the census (or its end date passes) AND at least
 * five members responded. There is no per-member view of answers anywhere.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import { CENSUS_MAX_QUESTIONS } from '@/lib/communities/census';
import type { CensusDTO } from '@/lib/communities/plus-schema';

interface DraftQuestion {
  prompt: string;
  kind: 'single' | 'multi';
  options: string;
}

function CreateCensus({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const { t } = useTranslation('f-communities-plus');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { prompt: '', kind: 'single', options: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const patch = (i: number, p: Partial<DraftQuestion>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));

  const save = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/census'), 'POST', {
      title,
      ...(description.trim() ? { description } : {}),
      ...(closesAt ? { closesAt: new Date(closesAt).toISOString() } : {}),
      questions: questions.map((q) => ({
        prompt: q.prompt,
        kind: q.kind,
        options: q.options
          .split('\n')
          .map((o) => o.trim())
          .filter(Boolean),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(
        res.error || t('census-create-error', { defaultValue: "Couldn't open the census" }),
      );
      return;
    }
    onCreated();
  };

  return (
    <form
      className="glass-pane m-3 flex flex-col gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3 className="text-sm font-semibold text-site-text">
        {t('census-create-title', { defaultValue: 'Open a community census' })}
      </h3>
      <Input
        value={title}
        maxLength={100}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('census-title-ph', { defaultValue: 'Census title' })}
        aria-label={t('census-title-ph', { defaultValue: 'Census title' })}
        required
      />
      <Textarea
        value={description}
        maxLength={500}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('census-desc-ph', { defaultValue: 'What is this survey for? (optional)' })}
        aria-label={t('census-desc-ph', { defaultValue: 'What is this survey for? (optional)' })}
      />
      <label className="flex flex-col gap-1 text-xs text-site-text-muted">
        {t('census-closes', { defaultValue: 'Closes automatically (optional)' })}
        <Input
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
        />
      </label>
      {questions.map((q, i) => (
        <fieldset key={i} className="glass-inset flex flex-col gap-2 rounded-site p-3">
          <div className="flex items-center gap-2">
            <Input
              value={q.prompt}
              maxLength={140}
              onChange={(e) => patch(i, { prompt: e.target.value })}
              placeholder={t('census-question-ph', { n: i + 1, defaultValue: 'Question {{n}}' })}
              aria-label={t('census-question-ph', { n: i + 1, defaultValue: 'Question {{n}}' })}
              required
            />
            <Select
              value={q.kind}
              onChange={(e) => patch(i, { kind: e.target.value === 'multi' ? 'multi' : 'single' })}
              aria-label={t('census-kind', { defaultValue: 'Answer type' })}
              className="w-40"
            >
              <option value="single">
                {t('census-kind-single', { defaultValue: 'Pick one' })}
              </option>
              <option value="multi">
                {t('census-kind-multi', { defaultValue: 'Pick several' })}
              </option>
            </Select>
            {questions.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('census-remove-question', { defaultValue: 'Remove question' })}
                onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            )}
          </div>
          <Textarea
            value={q.options}
            onChange={(e) => patch(i, { options: e.target.value })}
            placeholder={t('census-options-ph', { defaultValue: 'One option per line (2 to 8)' })}
            aria-label={t('census-options-ph', { defaultValue: 'One option per line (2 to 8)' })}
            rows={3}
          />
        </fieldset>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={questions.length >= CENSUS_MAX_QUESTIONS}
          onClick={() => setQuestions((qs) => [...qs, { prompt: '', kind: 'single', options: '' }])}
        >
          <Plus /> {t('census-add-question', { defaultValue: 'Add question' })}
        </Button>
        <Button type="submit" variant="accent" size="sm" loading={saving} disabled={!title.trim()}>
          {t('census-create', { defaultValue: 'Open census' })}
        </Button>
      </div>
    </form>
  );
}

function AnswerForm({
  slug,
  census,
  onDone,
}: {
  slug: string;
  census: CensusDTO;
  onDone: () => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const questions = census.questions ?? [];
  const complete = questions.every((q) => (picked[q.id]?.length ?? 0) > 0);

  const toggle = (qid: string, oid: string, multi: boolean) =>
    setPicked((p) => {
      const cur = p[qid] ?? [];
      if (!multi) return { ...p, [qid]: [oid] };
      return { ...p, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    });

  const submit = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, `/census/${census.id}/answer`), 'POST', {
      answers: questions.map((q) => ({ questionId: q.id, optionIds: picked[q.id] ?? [] })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(
        res.error || t('census-answer-error', { defaultValue: "Couldn't save your answers" }),
      );
      return;
    }
    toast.success(t('census-answered-toast', { defaultValue: 'Thanks for answering' }));
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {questions.map((q) => (
        <fieldset key={q.id}>
          <legend className="mb-2 text-sm font-semibold text-site-text">{q.prompt}</legend>
          <div className="flex flex-col gap-1.5">
            {q.options.map((o) => (
              <label
                key={o.id}
                className="glass-fill flex cursor-pointer items-center gap-3 rounded-site px-3 py-2 text-sm text-site-text has-[:checked]:ring-2 has-[:checked]:ring-site-accent"
              >
                <input
                  type={q.kind === 'multi' ? 'checkbox' : 'radio'}
                  name={`census-${q.id}`}
                  checked={(picked[q.id] ?? []).includes(o.id)}
                  onChange={() => toggle(q.id, o.id, q.kind === 'multi')}
                  className="accent-[var(--site-accent)]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-site-text-muted">
        {t('census-privacy', {
          defaultValue:
            'Answers are anonymous: only totals are ever stored or shown, never who chose what.',
        })}
      </p>
      <div className="flex justify-end">
        <Button type="submit" variant="accent" loading={saving} disabled={!complete}>
          {t('census-submit', { defaultValue: 'Submit answers' })}
        </Button>
      </div>
    </form>
  );
}

export default function CensusPanel({
  slug,
  joined,
  isMod,
}: {
  slug: string;
  joined: boolean;
  isMod: boolean;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [census, setCensus] = useState<CensusDTO | null | undefined>(undefined);

  const load = useCallback(async () => {
    const res = await plusFetch<{ census: CensusDTO | null }>(communityApi(slug, '/census'));
    setCensus(res.data?.census ?? null);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (census === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  if (census === null) {
    return isMod ? (
      <CreateCensus slug={slug} onCreated={load} />
    ) : (
      <EmptyState
        icon={BarChart3}
        title={t('census-none', { defaultValue: 'No census yet' })}
        description={t('census-none-desc', {
          defaultValue: 'When the mods run a community survey, it appears here.',
        })}
      />
    );
  }

  const close = async () => {
    const res = await plusFetch(communityApi(slug, `/census/${census.id}/close`), 'POST');
    if (!res.ok) {
      toast.error(
        res.error || t('census-close-error', { defaultValue: "Couldn't close the census" }),
      );
      return;
    }
    void load();
  };

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <section className="glass-pane p-4">
        <h3 className="text-base font-bold text-site-text">{census.title}</h3>
        {census.description && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-site-text-muted">
            {census.description}
          </p>
        )}
        <p className="mt-2 text-xs text-site-text-muted">
          {t('census-responses', {
            n: census.responseCount,
            defaultValue: '{{n}} responses so far',
          })}
          {census.closesAt && !census.closed
            ? ` · ${t('census-closes-at', {
                date: new Date(census.closesAt).toLocaleDateString(),
                defaultValue: 'closes {{date}}',
              })}`
            : ''}
        </p>
        {isMod && !census.closed && (
          <Button className="mt-3" size="sm" variant="outline" onClick={close}>
            {t('census-close', { defaultValue: 'Close and publish results' })}
          </Button>
        )}
      </section>

      {census.questions && joined && (
        <section className="glass-pane p-4">
          <AnswerForm slug={slug} census={census} onDone={load} />
        </section>
      )}
      {census.questions && !joined && (
        <p className="px-1 text-sm text-site-text-muted">
          {t('census-join', { defaultValue: 'Join the community to answer.' })}
        </p>
      )}
      {!census.closed && census.answered && (
        <p className="px-1 text-sm text-site-text">
          {t('census-thanks', {
            defaultValue: 'Thanks for answering. Results are published when the census closes.',
          })}
        </p>
      )}
      {census.withheld && (
        <p className="glass-fill p-4 text-sm text-site-text-muted">
          {t('census-withheld', {
            n: census.minResponses,
            defaultValue:
              'This census closed with fewer than {{n}} responses, so results are not published to protect privacy.',
          })}
        </p>
      )}
      {census.results && (
        <div className="flex flex-col gap-4">
          {census.results.map((q) => (
            <section key={q.id} className="glass-fill p-4">
              <h4 className="mb-2 text-sm font-semibold text-site-text">{q.prompt}</h4>
              <ul className="flex flex-col gap-2">
                {q.options.map((o) => (
                  <li key={o.id}>
                    <div className="flex justify-between text-xs text-site-text">
                      <span>{o.label}</span>
                      <span className="tabular-nums text-site-text-muted">
                        {o.pct}% ({o.count})
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full bg-site-surface"
                      role="img"
                      aria-label={`${o.label}: ${o.pct}%`}
                    >
                      <div
                        className="h-full rounded-full bg-site-accent"
                        style={{ width: `${o.pct}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {isMod && census.closed && (
        <div className="flex justify-end">
          <CreateCensusToggle slug={slug} onCreated={load} />
        </div>
      )}
    </div>
  );
}

function CreateCensusToggle({ slug, onCreated }: { slug: string; onCreated: () => void }) {
  const { t } = useTranslation('f-communities-plus');
  const [open, setOpen] = useState(false);
  if (open) return <CreateCensus slug={slug} onCreated={onCreated} />;
  return (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      {t('census-new', { defaultValue: 'Open a new census' })}
    </Button>
  );
}
