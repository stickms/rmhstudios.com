'use client';

/** N3 — mods write up to five onboarding questions; options can grant a label and flairs. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { FlairChip } from '@/components/communities/FlairChip';
import { communityApi, plusFetch } from '@/components/communities/plus-api';
import {
  ONBOARDING_MAX_OPTIONS,
  ONBOARDING_MAX_QUESTIONS,
  type FlairDTO,
  type OnboardingQuestionDTO,
} from '@/lib/communities/plus-schema';

interface DraftOption {
  label: string;
  roleTag: string;
  flairIds: string[];
}
interface DraftQuestion {
  prompt: string;
  options: DraftOption[];
}

const blankOption = (): DraftOption => ({ label: '', roleTag: '', flairIds: [] });

export function ModOnboarding({
  slug,
  flairs,
  onChange,
}: {
  slug: string;
  flairs: FlairDTO[];
  onChange: () => void;
}) {
  const { t } = useTranslation('f-communities-plus');
  const [draft, setDraft] = useState<DraftQuestion[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void plusFetch<{ questions: OnboardingQuestionDTO[] }>(communityApi(slug, '/onboarding')).then(
      (r) => {
        if (cancelled) return;
        setDraft(
          (r.data?.questions ?? []).map((q) => ({
            prompt: q.prompt,
            options: q.options.map((o) => ({
              label: o.label,
              roleTag: o.roleTag ?? '',
              flairIds: o.flairIds,
            })),
          })),
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!draft) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const setQ = (i: number, fn: (q: DraftQuestion) => DraftQuestion) =>
    setDraft((d) => d?.map((q, j) => (j === i ? fn(q) : q)) ?? null);
  const setO = (i: number, k: number, p: Partial<DraftOption>) =>
    setQ(i, (q) => ({ ...q, options: q.options.map((o, m) => (m === k ? { ...o, ...p } : o)) }));

  const save = async () => {
    setSaving(true);
    const res = await plusFetch(communityApi(slug, '/onboarding'), 'PUT', {
      questions: draft.map((q) => ({
        prompt: q.prompt,
        options: q.options.map((o) => ({
          label: o.label,
          ...(o.roleTag.trim() ? { roleTag: o.roleTag.trim() } : {}),
          flairIds: o.flairIds,
        })),
      })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(
        res.error || t('onb-save-error', { defaultValue: "Couldn't save the questions" }),
      );
      return;
    }
    toast.success(t('onb-saved', { defaultValue: 'Questions saved' }));
    onChange();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-site-text-muted">
        {t('onb-intro', {
          defaultValue:
            'New members see these right after joining. An option can give the member a role label (shown on their entry in Top contributors; labels never carry permissions) and make them follow flairs, so their feed leads with those posts. Saving replaces earlier questions and answers.',
        })}
      </p>
      {draft.map((q, i) => (
        <fieldset key={i} className="glass-pane flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Input
              value={q.prompt}
              maxLength={140}
              onChange={(e) => setQ(i, (x) => ({ ...x, prompt: e.target.value }))}
              placeholder={t('onb-question-ph', { defaultValue: 'Which games do you play?' })}
              aria-label={t('onb-question-label', { n: i + 1, defaultValue: 'Question {{n}}' })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('onb-remove-question', { defaultValue: 'Remove question' })}
              onClick={() => setDraft((d) => d?.filter((_, j) => j !== i) ?? null)}
            >
              <Trash2 />
            </Button>
          </div>
          {q.options.map((o, k) => (
            <div key={k} className="glass-inset flex flex-col gap-2 rounded-site p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={o.label}
                  maxLength={40}
                  onChange={(e) => setO(i, k, { label: e.target.value })}
                  placeholder={t('onb-option-ph', { defaultValue: 'Answer option' })}
                  aria-label={t('onb-option-label', { n: k + 1, defaultValue: 'Option {{n}}' })}
                />
                <Input
                  value={o.roleTag}
                  maxLength={24}
                  onChange={(e) => setO(i, k, { roleTag: e.target.value })}
                  placeholder={t('onb-role-ph', { defaultValue: 'Role label (optional)' })}
                  aria-label={t('onb-role-label', { defaultValue: 'Role label' })}
                />
                {q.options.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('onb-remove-option', { defaultValue: 'Remove option' })}
                    onClick={() =>
                      setQ(i, (x) => ({ ...x, options: x.options.filter((_, m) => m !== k) }))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              {flairs.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-site-text-muted">
                    {t('onb-follow', { defaultValue: 'Follows flairs:' })}
                  </span>
                  {flairs.map((f) => (
                    <FlairChip
                      key={f.id}
                      as="button"
                      flair={f}
                      aria-pressed={o.flairIds.includes(f.id)}
                      onClick={() =>
                        setO(i, k, {
                          flairIds: o.flairIds.includes(f.id)
                            ? o.flairIds.filter((x) => x !== f.id)
                            : [...o.flairIds, f.id].slice(0, 5),
                        })
                      }
                      className={`cursor-pointer ${o.flairIds.includes(f.id) ? 'ring-2 ring-site-accent' : 'opacity-60 hover:opacity-100'}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={q.options.length >= ONBOARDING_MAX_OPTIONS}
              onClick={() => setQ(i, (x) => ({ ...x, options: [...x.options, blankOption()] }))}
            >
              <Plus /> {t('onb-add-option', { defaultValue: 'Add option' })}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={draft.length >= ONBOARDING_MAX_QUESTIONS}
          onClick={() =>
            setDraft((d) => [...(d ?? []), { prompt: '', options: [blankOption(), blankOption()] }])
          }
        >
          <Plus /> {t('onb-add-question', { defaultValue: 'Add question' })}
        </Button>
        <Button
          variant="accent"
          size="sm"
          loading={saving}
          disabled={draft.some((q) => !q.prompt.trim() || q.options.some((o) => !o.label.trim()))}
          onClick={() => void save()}
        >
          {t('onb-save', { defaultValue: 'Save questions' })}
        </Button>
      </div>
    </div>
  );
}
