import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toast } from '@/lib/toast';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsSelectRow } from '@/components/settings/SettingsSelectRow';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/contract/client';
import { setCallAnswerApi } from '@/lib/call/calls.contract';
import { callAnswerQuery } from '@/lib/settings/prefs.queries';
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
  const queryClient = useQueryClient();
  const query = callAnswerQuery();
  const { data, isPending } = useQuery(query);
  const loaded = !isPending;
  const mode: CallAnswerMode = isCallAnswerMode(data?.mode) ? data.mode : DEFAULT_CALL_ANSWER_MODE;
  // The note as last saved, so leaving the field unchanged does not write.
  const savedNote = typeof data?.note === 'string' ? data.note : '';
  // What is typed in the field; null until the member edits it.
  const [draft, setDraft] = useState<string | null>(null);
  const note = draft ?? savedNote;

  function save(
    body: {
      mode: CallAnswerMode;
      note?: string;
    },
    onFail: () => void,
  ) {
    api(setCallAnswerApi, {
      body,
    }).catch(() => {
      onFail();
      toast.error(
        t('call-privacy-save-error', {
          defaultValue: 'Could not save',
        }),
      );
    });
  }

  function choose(next: CallAnswerMode) {
    const previous = data;
    queryClient.setQueryData(query.queryKey, {
      mode: next,
      note: savedNote,
    });
    save(
      {
        mode: next,
      },
      () => queryClient.setQueryData(query.queryKey, previous),
    );
  }

  function commitNote() {
    if (note === savedNote) return;
    const previous = data;
    queryClient.setQueryData(query.queryKey, {
      mode,
      note,
    });
    save(
      {
        mode,
        note,
      },
      () => {
        queryClient.setQueryData(query.queryKey, previous);
        setDraft(null);
      },
    );
  }

  const LABEL: Record<
    CallAnswerMode,
    {
      title: string;
      hint: string;
    }
  > = {
    ring: {
      title: t('call-answer-ring', {
        defaultValue: 'Ring me',
      }),
      hint: t('call-answer-ring-hint', {
        defaultValue: 'Calls ring as normal. Nothing is sent automatically.',
      }),
    },
    ring_reply: {
      title: t('call-answer-ring-reply', {
        defaultValue: 'Ring me, then reply if I can’t answer',
      }),
      hint: t('call-answer-ring-reply-hint', {
        defaultValue: 'If you are on another call or miss it, the caller gets a short automatic message.',
      }),
    },
    reply_only: {
      title: t('call-answer-reply-only', {
        defaultValue: 'Don’t ring me, reply instead',
      }),
      hint: t('call-answer-reply-only-hint', {
        defaultValue: 'Calls never ring. The caller gets a short automatic message instead.',
      }),
    },
  };

  return (
    <SettingsSection
      title={t('call-answer-title', {
        defaultValue: 'Answering calls',
      })}
      description={t('call-answer-subtitle', {
        defaultValue:
          'Choose what happens when you can’t pick up. Only people who are allowed to call you ever get a reply.',
      })}
    >
      <SettingsSelectRow
        label={t('call-answer-who', {
          defaultValue: 'When someone calls me',
        })}
        hint={LABEL[mode].hint}
        value={mode}
        options={CALL_ANSWER_MODES.map((m) => ({
          value: m,
          label: LABEL[m].title,
        }))}
        onChange={(m) => choose(m as CallAnswerMode)}
        disabled={!loaded}
      />

      {mode !== 'ring' && (
        <div className="border-t border-site-border pt-3">
          <label htmlFor="call-busy-note" className="mb-1 block text-sm font-medium text-site-text">
            {t('call-answer-note-label', {
              defaultValue: 'Why you might be unavailable (optional)',
            })}
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
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitNote}
            className="min-h-0"
          />
          <p className="settings-row__hint py-2">
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
