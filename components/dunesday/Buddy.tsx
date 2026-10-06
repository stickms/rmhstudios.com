'use client';

/**
 * Dunesday Buddy — the chat assistant, as a Windows Live Messenger-style
 * conversation window (the desktop's Messenger app).
 *
 * It knows the viewer's plan (sent as ids and numbers with each question; the
 * server writes the grounding — see `lib/dunesday/assistant.server.ts`) and the
 * films themselves. The spoiler shield, on by default, tells it which titles
 * the viewer has actually watched so it never spoils the rest.
 *
 * The transcript lives for the window's life only. Nothing is stored
 * server-side.
 */

import { MessageCircle, Send, ShieldCheck, ShieldOff, Smile } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DunesdayAsk } from '@/lib/dunesday/ask-schema';
import { allTitles, isIncluded } from '@/lib/dunesday/state';
import { useDunesday } from './DunesdayProvider';
import { UserTile } from './os/UserTile';
import { useProfile } from './os/useProfile';
import { useEntryLabel } from './Schedule';
import { sfx } from './sound';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

/** `**bold**` only — the prompt asks for plain prose, this keeps the odd bold readable. */
function renderText(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

export function BuddyChat({ initialQuestion }: { initialQuestion?: string }) {
  const { t } = useTranslation('c-dunesday');
  const { plan, state, actions, today, remainingMinutes } = useDunesday();
  const profile = useProfile();
  const label = useEntryLabel(state);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const asked = useRef<string | null>(null);

  // Written out as literal t() calls so i18next-parser can extract them.
  const suggestions = [
    t('ask-tonight', { defaultValue: 'What’s on tonight?' }),
    t('ask-on-track', { defaultValue: 'Am I on track? What could I cut?' }),
    t('ask-remember', { defaultValue: 'What should I remember before Doomsday?' }),
    t('ask-skippable', { defaultValue: 'Which shows are safe to skip?' }),
    t('ask-dune', { defaultValue: 'Explain the Bene Gesserit, spoiler-free' }),
  ];

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  const payload = (question: string, history: Turn[]): DunesdayAsk => {
    const builtIn = allTitles(state).filter((x) => x.franchise !== 'extra');
    return {
      question,
      history,
      spoilerShield: state.spoilerShield,
      today,
      plan: {
        deadline: state.settings.deadline,
        finishDate: plan.finishDate,
        minutesPerDay: Math.round(plan.minutesPerDay),
        mode: state.settings.mode,
        remainingMinutes: Math.round(remainingMinutes),
        watched: Object.keys(state.watched)
          .filter((id) => !id.startsWith('custom-'))
          .slice(0, 120),
        partial: Object.fromEntries(
          Object.entries(state.episodesWatched).filter(
            ([id, n]) => n > 0 && !id.startsWith('custom-'),
          ),
        ),
        included: builtIn.filter((x) => isIncluded(state, x)).map((x) => x.id),
        upcoming: plan.days
          .filter((d) => d.entries.length)
          .slice(0, 14)
          .map((d) => ({
            date: d.date,
            items: d.entries.slice(0, 12).map((e) => label(e).slice(0, 120)),
          })),
        custom: state.customTitles
          .filter((c) => state.included[c.id] ?? true)
          .map((c) => ({ id: c.id, title: c.title, minutes: c.minutes })),
      },
    };
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    const history = turns.slice(-6);
    setTurns((cur) => [...cur, { role: 'user', content: q }]);
    setDraft('');
    setPending(true);
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/dunesday/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(q.slice(0, 500), history)),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (res.status === 429) {
        setError(
          t('ask-slow-down', {
            defaultValue: 'Whoa, lots of questions! Give it a minute and try again.',
          }),
        );
        return;
      }
      if (!res.ok || !data.answer) {
        setError(
          data.error ?? t('ask-failed', { defaultValue: 'That didn’t go through. Try again.' }),
        );
        return;
      }
      sfx.bloop();
      setTurns((cur) => [...cur, { role: 'assistant', content: data.answer as string }]);
    } catch (cause) {
      if ((cause as Error)?.name !== 'AbortError') {
        setError(
          t('ask-offline', { defaultValue: 'Couldn’t reach Buddy. Check your connection.' }),
        );
      }
    } finally {
      setPending(false);
    }
  };

  // A question handed over by another app ("Ask Messenger about this").
  useEffect(() => {
    if (initialQuestion && asked.current !== initialQuestion) {
      asked.current = initialQuestion;
      void ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const name = t('buddy-name', { defaultValue: 'Dunesday Buddy' });

  return (
    <div className="ds-msn">
      <div className="ds-buddy-head">
        <span className="ds-buddy-avatar">
          <Smile size={22} aria-hidden="true" />
          <span className="ds-presence" aria-hidden="true" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ds-buddy-name">{name}</div>
          <div className="ds-buddy-mood">
            {state.spoilerShield
              ? t('buddy-mood-shield', {
                  defaultValue: '(Online) — spoiler shield up, ask me anything',
                })
              : t('buddy-mood-open', {
                  defaultValue: '(Online) — spoilers allowed, you asked for it',
                })}
          </div>
        </div>
      </div>

      <div className="ds-msn-main">
        <div ref={logRef} className="ds-buddy-log" aria-live="polite">
          <div className="ds-msg ds-msg--bot">
            <span className="ds-msg-who">{name}</span>
            {t('buddy-hello', {
              defaultValue:
                'Hey! I know your plan and I know these movies. Ask about tonight, your pace, or any film — recaps, characters, what matters for December.',
            })}
          </div>
          {turns.map((turn, i) => (
            <div
              key={i}
              className={turn.role === 'user' ? 'ds-msg ds-msg--user' : 'ds-msg ds-msg--bot'}
            >
              <span className="ds-msg-who">{turn.role === 'assistant' ? name : profile.name}</span>
              {turn.role === 'assistant' ? renderText(turn.content) : turn.content}
            </div>
          ))}
          {pending && (
            <div
              className="ds-msg ds-msg--bot"
              aria-label={t('buddy-typing', { defaultValue: 'Buddy is typing…' })}
            >
              <span className="ds-typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          {error && (
            <div className="ds-msg ds-msg--error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="ds-msn-pics" aria-hidden="true">
          <span className="ds-usertile ds-msn-buddypic" style={{ width: 72, height: 72 }}>
            <Smile size={40} />
          </span>
          <UserTile image={profile.image} size={72} />
        </div>
      </div>

      {turns.length === 0 && (
        <div className="ds-buddy-suggest">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="ds-suggest"
              onClick={() => ask(s)}
              disabled={pending}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="ds-buddy-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(draft);
        }}
      >
        <textarea
          ref={inputRef}
          className="ds-input"
          rows={2}
          maxLength={500}
          value={draft}
          placeholder={t('buddy-placeholder', { defaultValue: 'Type a message…' })}
          aria-label={t('buddy-placeholder', { defaultValue: 'Type a message…' })}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
        />
        <button
          type="submit"
          className="ds-btn"
          disabled={!draft.trim() || pending}
          aria-label={t('buddy-send', { defaultValue: 'Send' })}
        >
          <Send size={16} aria-hidden="true" />
          {t('buddy-send', { defaultValue: 'Send' })}
        </button>
      </form>
      <div className="ds-buddy-foot">
        <label className="ds-check" style={{ fontSize: 12, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={state.spoilerShield}
            onChange={(e) => actions.set('spoilerShield', e.target.checked)}
          />
          {state.spoilerShield ? (
            <ShieldCheck size={14} aria-hidden="true" />
          ) : (
            <ShieldOff size={14} aria-hidden="true" />
          )}
          {t('spoiler-shield', { defaultValue: 'Spoiler shield' })}
        </label>
        <span>
          <MessageCircle size={12} aria-hidden="true" style={{ verticalAlign: '-2px' }} />{' '}
          {t('buddy-ai-note', { defaultValue: 'AI can be wrong about details.' })}
        </span>
      </div>
    </div>
  );
}
