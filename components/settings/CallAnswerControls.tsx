import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PhoneMissed } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { getCallAnswerApi, setCallAnswerApi } from '@/lib/call/calls.contract';
import {
  CALL_ANSWER_MODES,
  CALL_BUSY_NOTE_MAX,
  DEFAULT_CALL_ANSWER_MODE,
  isCallAnswerMode,
  type CallAnswerMode,
} from '@/lib/call/answer';

/**
 * CallAnswerControls — how calls to this account are answered: ring as normal,
 * ring and then send a short automatic DM if the user is busy or misses it, or
 * do not ring and send the DM instead. The DM is written from an optional note
 * the user types here; every one is labelled as automatic.
 *
 * Saves to /api/calls/answer. What each mode does is decided by the call hub and
 * `lib/call/auto-reply.server.ts`, never by this form.
 */
export function CallAnswerControls() {
  const { t } = useTranslation('site');
  const [mode, setMode] = useState<CallAnswerMode>(DEFAULT_CALL_ANSWER_MODE);
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  // The note as last saved, so leaving the field unchanged does not write.
  const savedNote = useRef('');

  useEffect(() => {
    api(getCallAnswerApi, { retries: 0 })
      .catch(() => null)
      .then((d: { mode?: unknown; note?: unknown } | null) => {
        if (d && isCallAnswerMode(d.mode)) setMode(d.mode);
        if (d && typeof d.note === 'string') {
          setNote(d.note);
          savedNote.current = d.note;
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function save(body: { mode: CallAnswerMode; note?: string }, onFail: () => void) {
    api(setCallAnswerApi, { body })
      .catch(() => {
        onFail();
        toast.error(t('call-privacy-save-error', { defaultValue: 'Could not save' }));
      });
  }

  function choose(next: CallAnswerMode) {
    const previous = mode;
    setMode(next);
    save({ mode: next }, () => setMode(previous));
  }

  function commitNote() {
    if (note === savedNote.current) return;
    const previous = savedNote.current;
    savedNote.current = note;
    save({ mode, note }, () => {
      savedNote.current = previous;
      setNote(previous);
    });
  }

  const LABEL: Record<CallAnswerMode, { title: string; hint: string }> = {
    ring: {
      title: t('call-answer-ring', { defaultValue: 'Ring me' }),
      hint: t('call-answer-ring-hint', {
        defaultValue: 'Calls ring as normal. Nothing is sent automatically.',
      }),
    },
    ring_reply: {
      title: t('call-answer-ring-reply', { defaultValue: 'Ring me, then reply if I can’t answer' }),
      hint: t('call-answer-ring-reply-hint', {
        defaultValue:
          'If you are on another call or miss it, the caller gets a short automatic message.',
      }),
    },
    reply_only: {
      title: t('call-answer-reply-only', { defaultValue: 'Don’t ring me, reply instead' }),
      hint: t('call-answer-reply-only-hint', {
        defaultValue: 'Calls never ring. The caller gets a short automatic message instead.',
      }),
    },
  };

  return (
    <SettingsSection
      icon={PhoneMissed}
      title={t('call-answer-title', { defaultValue: 'Answering calls' })}
      description={t('call-answer-subtitle', {
        defaultValue:
          'Choose what happens when you can’t pick up. Only people who are allowed to call you ever get a reply.',
      })}
    >
      <fieldset disabled={!loaded}>
        <legend className="mb-2 text-sm font-medium text-site-text">
          {t('call-answer-who', { defaultValue: 'When someone calls me' })}
        </legend>
        <div className="flex flex-col gap-1">
          {CALL_ANSWER_MODES.map((m) => (
            <label
              key={m}
              className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-site-sm px-3 py-2 hover:bg-site-surface-hover"
            >
              <input
                type="radio"
                name="call-answer-mode"
                value={m}
                checked={mode === m}
                onChange={() => choose(m)}
                className="mt-1 accent-site-accent"
              />
              <span className="text-sm text-site-text">{LABEL[m].title}</span>
              <span className="col-start-2 text-xs text-site-text-muted">{LABEL[m].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode !== 'ring' && (
        <div className="border-t border-site-border pt-3">
          <label htmlFor="call-busy-note" className="mb-1 block text-sm font-medium text-site-text">
            {t('call-answer-note-label', { defaultValue: 'Why you might be unavailable (optional)' })}
          </label>
          <Textarea
            id="call-busy-note"
            value={note}
            maxLength={CALL_BUSY_NOTE_MAX}
            rows={2}
            disabled={!loaded}
            placeholder={t('call-answer-note-placeholder', {
              defaultValue: 'e.g. In class until 3pm',
            })}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commitNote}
            className="min-h-0"
          />
          <p className="mt-1 text-xs text-site-text-muted">
            {t('call-answer-note-hint', {
              defaultValue:
                'AI turns this into a short, friendly reply. Each one is labelled as automatic, and a caller gets at most one every 30 minutes.',
            })}
          </p>
        </div>
      )}
    </SettingsSection>
  );
}
