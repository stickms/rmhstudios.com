'use client';

/**
 * RMHLadder — the answer bank editor.
 *
 * Enter once, reuse on every application. The scalars are the questions every
 * ATS asks; the essays are the free-text answers that repeat verbatim; the STAR
 * stories are what the interview prep sheet matches against a posting.
 *
 * The panel is L2 `.glass-pane` (one per page). Each essay and story is a
 * repeated row and therefore L1 `.glass-fill` — zero backdrop blur, because a
 * user with twenty stories would otherwise be compositing twenty blurred
 * surfaces on one screen.
 *
 * Sensitive fields (salary expectation, work authorization, sponsorship) carry
 * a visible marker. They are personal data with real consequences, and a user
 * typing a salary figure into a website deserves to be told which fields those
 * are rather than discovering it later.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  answerBankCompleteness,
  EMPTY_ANSWER_BANK,
  MAX_ESSAYS,
  MAX_STORIES,
  SCALAR_FIELDS,
  type AnswerBank,
  type EssayAnswer,
  type ScalarFieldKey,
  type StarStory,
} from '@/lib/rmhladder/answer-bank';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const EMPTY_ESSAY: EssayAnswer = { question: '', answer: '' };
const EMPTY_STORY: StarStory = { title: '', situation: '', task: '', action: '', result: '' };

const STORY_PARTS: { key: keyof Omit<StarStory, 'title'>; label: string }[] = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
];

export interface AnswerBankPanelProps {
  /** Raised after a successful save, so a packet on the same page can refresh. */
  onSaved?: (bank: AnswerBank) => void;
}

export function AnswerBankPanel({ onSaved }: AnswerBankPanelProps) {
  const { t } = useTranslation('site');
  const [bank, setBank] = useState<AnswerBank>(EMPTY_ANSWER_BANK);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/rmhladder/answers');
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!cancelled && data?.answers) setBank(data.answers as AnswerBank);
      } catch {
        if (!cancelled) {
          toast.error(
            t('ladder.answersLoadFailed', { defaultValue: 'Could not load your answers.' }),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const completeness = useMemo(() => answerBankCompleteness(bank), [bank]);

  const setScalar = useCallback((key: ScalarFieldKey, value: string | boolean | null) => {
    setBank((prev) => ({ ...prev, [key]: value }) as AnswerBank);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/rmhladder/answers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bank),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'save failed');
      setBank(data.answers as AnswerBank);
      onSaved?.(data.answers as AnswerBank);
      toast.success(t('ladder.answersSaved', { defaultValue: 'Answers saved.' }));
    } catch {
      toast.error(
        t('ladder.answersSaveFailed', {
          defaultValue: 'Could not save. Check your links are http(s) URLs.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [bank, onSaved, t]);

  if (loading) {
    return (
      <section className="glass-pane flex min-h-32 items-center justify-center p-5">
        <Loader2 className="size-5 animate-spin text-site-text-dim" aria-hidden />
        <span className="sr-only">{t('ladder.answersLoading', { defaultValue: 'Loading…' })}</span>
      </section>
    );
  }

  return (
    <section className="glass-pane p-4 sm:p-5" aria-labelledby="ladder-answers-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="ladder-answers-heading" className="text-sm font-semibold text-site-text">
          {t('ladder.answersTitle', { defaultValue: 'Answer bank' })}
        </h2>
        <span className="text-xs text-site-text-dim">
          {t('ladder.answersProgress', {
            defaultValue: '{{filled}} of {{total}} filled in',
            filled: completeness.filled,
            total: completeness.total,
          })}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={save}
          loading={saving}
          className="ml-auto min-h-11"
        >
          <Save className="size-4" aria-hidden />
          {t('ladder.answersSave', { defaultValue: 'Save' })}
        </Button>
      </div>

      <p className="mt-2 text-xs text-site-text-dim">
        {t('ladder.answersIntro', {
          defaultValue:
            'Entered once, reused on every application. RMHLadder never submits anything for you — you copy these into the employer’s form and press the button yourself.',
        })}
      </p>

      {/* Scalars */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {SCALAR_FIELDS.map((field) => {
          const id = `ladder-answer-${field.key}`;
          const value = bank[field.key];
          return (
            <div key={field.key}>
              <Label htmlFor={id} className="flex items-center gap-1.5">
                {field.label}
                {field.sensitive && (
                  <ShieldAlert
                    className="size-3 text-site-warning"
                    aria-label={t('ladder.answersSensitive', {
                      defaultValue: 'Sensitive personal data',
                    })}
                  />
                )}
              </Label>
              {field.kind === 'boolean' ? (
                <Select
                  id={id}
                  containerClassName="mt-1.5"
                  value={value === null ? '' : value ? 'yes' : 'no'}
                  onChange={(e) =>
                    setScalar(field.key, e.target.value === '' ? null : e.target.value === 'yes')
                  }
                >
                  <option value="">
                    {t('ladder.answersUnset', { defaultValue: 'Not answered' })}
                  </option>
                  <option value="yes">{t('ladder.answersYes', { defaultValue: 'Yes' })}</option>
                  <option value="no">{t('ladder.answersNo', { defaultValue: 'No' })}</option>
                </Select>
              ) : (
                <Input
                  id={id}
                  className="mt-1.5"
                  type={field.kind === 'url' ? 'url' : 'text'}
                  inputMode={field.kind === 'url' ? 'url' : 'text'}
                  placeholder={field.placeholder}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => setScalar(field.key, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-site-text-dim">
        <ShieldAlert className="mt-px size-3 shrink-0 text-site-warning" aria-hidden />
        <span>
          {t('ladder.answersSensitiveNote', {
            defaultValue:
              'Marked fields are sensitive personal data. They are included in your account data export and erased when you delete your account.',
          })}
        </span>
      </p>

      {/* Essays */}
      <div className="mt-6 border-t border-site-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-site-text">
            {t('ladder.answersEssays', { defaultValue: 'Repeated essay questions' })}
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto min-h-11"
            disabled={bank.essays.length >= MAX_ESSAYS}
            onClick={() => setBank((p) => ({ ...p, essays: [...p.essays, { ...EMPTY_ESSAY }] }))}
          >
            <Plus className="size-4" aria-hidden />
            {t('ladder.answersAddEssay', { defaultValue: 'Add' })}
          </Button>
        </div>

        <div className="mt-3 grid gap-3">
          {bank.essays.map((essay, i) => (
            <div key={`essay-${i}`} className="glass-fill p-3">
              <div className="flex items-start gap-2">
                <Input
                  aria-label={t('ladder.answersEssayQuestion', { defaultValue: 'Question' })}
                  placeholder={t('ladder.answersEssayQuestionHint', {
                    defaultValue: 'Why do you want to work here?',
                  })}
                  value={essay.question}
                  onChange={(e) =>
                    setBank((p) => ({
                      ...p,
                      essays: p.essays.map((x, j) =>
                        j === i ? { ...x, question: e.target.value } : x,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setBank((p) => ({ ...p, essays: p.essays.filter((_, j) => j !== i) }))
                  }
                  aria-label={t('ladder.answersRemoveEssay', { defaultValue: 'Remove essay' })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <Textarea
                className="mt-2"
                rows={4}
                aria-label={t('ladder.answersEssayAnswer', { defaultValue: 'Answer' })}
                value={essay.answer}
                onChange={(e) =>
                  setBank((p) => ({
                    ...p,
                    essays: p.essays.map((x, j) =>
                      j === i ? { ...x, answer: e.target.value } : x,
                    ),
                  }))
                }
              />
            </div>
          ))}
          {bank.essays.length === 0 && (
            <p className="text-sm text-site-text-dim">
              {t('ladder.answersNoEssays', {
                defaultValue: 'No essays yet. Add the answers you keep retyping.',
              })}
            </p>
          )}
        </div>
      </div>

      {/* STAR stories */}
      <div className="mt-6 border-t border-site-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-site-text">
            {t('ladder.answersStories', { defaultValue: 'STAR stories' })}
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="ml-auto min-h-11"
            disabled={bank.stories.length >= MAX_STORIES}
            onClick={() => setBank((p) => ({ ...p, stories: [...p.stories, { ...EMPTY_STORY }] }))}
          >
            <Plus className="size-4" aria-hidden />
            {t('ladder.answersAddStory', { defaultValue: 'Add' })}
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-site-text-dim">
          {t('ladder.answersStoriesHint', {
            defaultValue: 'These are what the interview prep sheet matches against a posting.',
          })}
        </p>

        <div className="mt-3 grid gap-3">
          {bank.stories.map((story, i) => (
            <div key={`story-${i}`} className="glass-fill p-3">
              <div className="flex items-start gap-2">
                <Input
                  aria-label={t('ladder.answersStoryTitle', { defaultValue: 'Story title' })}
                  placeholder={t('ladder.answersStoryTitleHint', {
                    defaultValue: 'Shipping the billing migration',
                  })}
                  value={story.title}
                  onChange={(e) =>
                    setBank((p) => ({
                      ...p,
                      stories: p.stories.map((x, j) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    }))
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() =>
                    setBank((p) => ({ ...p, stories: p.stories.filter((_, j) => j !== i) }))
                  }
                  aria-label={t('ladder.answersRemoveStory', { defaultValue: 'Remove story' })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {STORY_PARTS.map((part) => (
                  <Textarea
                    key={part.key}
                    rows={3}
                    aria-label={part.label}
                    placeholder={part.label}
                    value={story[part.key]}
                    onChange={(e) =>
                      setBank((p) => ({
                        ...p,
                        stories: p.stories.map((x, j) =>
                          j === i ? { ...x, [part.key]: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          {bank.stories.length === 0 && (
            <p className="text-sm text-site-text-dim">
              {t('ladder.answersNoStories', {
                defaultValue: 'No stories yet. Three or four good ones cover most interviews.',
              })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
