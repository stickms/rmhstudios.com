import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CalendarCheck, Play, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { planExam, type Topic } from '@/lib/rmhstudy/exam-planner';
import { C2S, S2C } from '@/lib/rmhstudy/events';
import { connectToRmhStudy, emit, getSocket } from '@/lib/rmhstudy/socket';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { toolsApi } from '@/lib/tools/client';
import type { StudyPlanInput } from '@/lib/tools/schemas';

type Draft = StudyPlanInput & { id: string | null };
type SavedPlan = StudyPlanInput & { id: string };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const newTopic = () => ({
  id: Math.random().toString(36).slice(2, 10),
  name: '',
  hours: 4,
  confidence: 0.5,
});
const localToday = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const blank = (): Draft => ({
  id: null,
  title: '',
  examDate: '',
  topics: [newTopic()],
  hoursByWeekday: [1, 2, 2, 2, 2, 2, 1],
});
const fmt = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;

const inputCls = 'glass-inset h-9 rounded-site-sm px-2 text-sm text-(--app-text)';

export default function StudyPlanner() {
  const { t } = useTranslation('f-tools');
  const router = useRouter();
  const [saved, setSaved] = useState<SavedPlan[]>([]);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => localToday(), []);

  useEffect(() => {
    toolsApi<{ plans: SavedPlan[] }>('GET', '/api/study-plans')
      .then((d) => {
        setSaved(d.plans);
        if (d.plans[0]) setDraft(d.plans[0]);
      })
      .catch(() =>
        toast.error(t('plan-load-failed', { defaultValue: 'Could not load your plans' })),
      );
  }, [t]);

  const plan = useMemo(() => {
    if (draft.examDate <= today) return null;
    const topics: Topic[] = draft.topics.map((x) => ({
      id: x.id,
      hours: x.hours,
      confidence: x.confidence,
    }));
    return planExam(today, draft.examDate, topics, draft.hoursByWeekday);
  }, [today, draft.examDate, draft.topics, draft.hoursByWeekday]);
  const nameOf = (id: string) =>
    id === 'review'
      ? t('plan-review', { defaultValue: 'Review everything' })
      : draft.topics.find((x) => x.id === id)?.name || t('plan-topic', { defaultValue: 'Topic' });

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchTopic = (id: string, p: Partial<Draft['topics'][number]>) =>
    patch({ topics: draft.topics.map((x) => (x.id === id ? { ...x, ...p } : x)) });

  const save = useCallback(async () => {
    const { id, ...body } = draft;
    const payload = {
      ...body,
      title: body.title.trim() || t('plan-untitled', { defaultValue: 'Exam plan' }),
    };
    setBusy(true);
    try {
      if (id) {
        await toolsApi('PUT', `/api/study-plans/${id}`, payload);
        setSaved((s) => s.map((x) => (x.id === id ? { id, ...payload } : x)));
      } else {
        const r = await toolsApi<{ id: string }>('POST', '/api/study-plans', payload);
        setSaved((s) => [{ id: r.id, ...payload }, ...s]);
        patch({ id: r.id });
      }
      toast.success(t('plan-saved', { defaultValue: 'Plan saved' }));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('plan-save-failed', {
              defaultValue: 'Check the exam date and topics, then try again',
            }),
      );
    } finally {
      setBusy(false);
    }
  }, [draft, t]);

  const remove = async () => {
    if (!draft.id) return;
    try {
      await toolsApi('DELETE', `/api/study-plans/${draft.id}`);
      const rest = saved.filter((x) => x.id !== draft.id);
      setSaved(rest);
      setDraft(rest[0] ?? blank());
    } catch {
      toast.error(t('plan-delete-failed', { defaultValue: 'Could not delete' }));
    }
  };

  // Open the room you are already in, or create one with this block's length.
  const startBlock = async (minutes: number) => {
    try {
      await connectToRmhStudy();
      const existing = useRmhStudyStore.getState().room;
      if (existing) {
        router.navigate({ to: `/rmhstudy/${existing.roomCode}` });
        return;
      }
      const socket = getSocket();
      const onState = (data: { roomCode?: string }) => {
        if (!data.roomCode) return;
        socket?.off(S2C.ROOM_STATE, onState);
        router.navigate({ to: `/rmhstudy/${data.roomCode}` });
      };
      socket?.on(S2C.ROOM_STATE, onState);
      emit(C2S.ROOM_CREATE, {
        settings: {
          workDurationMs: Math.min(120, Math.max(1, minutes)) * 60_000,
          sessionsBeforeLongBreak: 1,
          autoStartBreaks: true,
          autoStartWork: false,
        },
      });
    } catch {
      toast.error(t('plan-start-failed', { defaultValue: 'Could not open a study room' }));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="flex items-center gap-2">
        <CalendarCheck className="h-6 w-6 text-(--app-accent)" aria-hidden />
        <h1 className="text-2xl font-bold">
          {t('plan-heading', { defaultValue: 'Exam planner' })}
        </h1>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t('plan-pick', { defaultValue: 'Choose a plan' })}
          className={inputCls}
          value={draft.id ?? ''}
          onChange={(e) => {
            const p = saved.find((x) => x.id === e.target.value);
            if (p) setDraft(p);
          }}
        >
          {!draft.id && (
            <option value="">{t('plan-unsaved', { defaultValue: 'Unsaved plan' })}</option>
          )}
          {saved.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => setDraft(blank())}>
          <Plus /> {t('plan-new', { defaultValue: 'New plan' })}
        </Button>
        {draft.id && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            aria-label={t('plan-delete', { defaultValue: 'Delete plan' })}
          >
            <Trash2 />
          </Button>
        )}
      </div>

      <section className="glass-pane space-y-4 rounded-(--app-radius) p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-(--app-text-muted)">
              {t('plan-title', { defaultValue: 'Plan name' })}
            </span>
            <input
              className={`${inputCls} w-full`}
              maxLength={120}
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-(--app-text-muted)">
              {t('plan-exam-date', { defaultValue: 'Exam date' })}
            </span>
            <input
              type="date"
              className={`${inputCls} w-full`}
              min={today}
              value={draft.examDate}
              onChange={(e) => patch({ examDate: e.target.value })}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {t('plan-topics', { defaultValue: 'Topics' })}
          </legend>
          {draft.topics.map((tp) => (
            <div key={tp.id} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
              <input
                className={inputCls}
                maxLength={80}
                placeholder={t('plan-topic-name', { defaultValue: 'Topic name' })}
                aria-label={t('plan-topic-name', { defaultValue: 'Topic name' })}
                value={tp.name}
                onChange={(e) => patchTopic(tp.id, { name: e.target.value })}
              />
              <input
                type="number"
                min={0.5}
                max={200}
                step={0.5}
                className={inputCls}
                aria-label={t('plan-topic-hours', { defaultValue: 'Hours needed' })}
                value={tp.hours}
                onChange={(e) => patchTopic(tp.id, { hours: Number(e.target.value) })}
              />
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                aria-label={t('plan-topic-confidence', { defaultValue: 'Confidence' })}
                value={Math.round(tp.confidence * 100)}
                onChange={(e) => patchTopic(tp.id, { confidence: Number(e.target.value) / 100 })}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={draft.topics.length === 1}
                onClick={() => patch({ topics: draft.topics.filter((x) => x.id !== tp.id) })}
                aria-label={t('plan-topic-remove', { defaultValue: 'Remove topic' })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <p className="text-xs text-(--app-text-muted)">
            {t('plan-topics-hint', {
              defaultValue:
                'Hours you think it needs, and how confident you feel (right is solid).',
            })}
          </p>
          {draft.topics.length < 30 && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => patch({ topics: [...draft.topics, newTopic()] })}
            >
              <Plus /> {t('plan-add-topic', { defaultValue: 'Add topic' })}
            </Button>
          )}
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium">
            {t('plan-hours', { defaultValue: 'Hours you can study per weekday' })}
          </legend>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="space-y-1 text-center text-xs text-(--app-text-muted)">
                {d}
                <input
                  type="number"
                  min={0}
                  max={16}
                  step={0.5}
                  className={`${inputCls} w-full px-1 text-center`}
                  value={draft.hoursByWeekday[i]}
                  onChange={(e) =>
                    patch({
                      hoursByWeekday: draft.hoursByWeekday.map((h, j) =>
                        j === i ? Number(e.target.value) : h,
                      ),
                    })
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>

        <Button
          onClick={save}
          disabled={busy || !draft.examDate || draft.topics.some((x) => !x.name.trim())}
        >
          <Save /> {t('plan-save', { defaultValue: 'Save plan' })}
        </Button>
      </section>

      {plan && (
        <section
          className="space-y-3"
          aria-label={t('plan-days', { defaultValue: 'Day-by-day plan' })}
        >
          {plan.shortfallHours > 0 && (
            <p role="status" className="glass-fill rounded-(--app-radius) p-3 text-sm">
              {t('plan-shortfall', {
                defaultValue:
                  'This does not fit: you are {{hours}} hours short. Add study time or cut a topic.',
                hours: plan.shortfallHours,
              })}
            </p>
          )}
          <ol className="space-y-2">
            {plan.days
              .filter((d) => d.blocks.length > 0)
              .map((d) => (
                <li key={d.date} className="glass-fill rounded-(--app-radius) p-3">
                  <h3 className="mb-2 text-sm font-semibold">
                    {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
                    {d.date === today && (
                      <span className="ml-2 text-xs text-(--app-accent)">
                        {t('plan-today', { defaultValue: 'Today' })}
                      </span>
                    )}
                  </h3>
                  <ul className="space-y-1.5">
                    {d.blocks.map((b, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {nameOf(b.topicId)}{' '}
                          <span className="text-(--app-text-muted)">- {fmt(b.minutes)}</span>
                        </span>
                        <Button variant="outline" size="xs" onClick={() => startBlock(b.minutes)}>
                          <Play /> {t('plan-start', { defaultValue: 'Start this block' })}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ol>
        </section>
      )}
    </div>
  );
}
