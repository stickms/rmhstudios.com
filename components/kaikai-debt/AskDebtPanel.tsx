'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogIn, MessageCircleQuestion, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSession } from '@/components/Providers';
import { MAX_QUESTION_CHARS } from '@/lib/kaikai-debt/debt';
import { playAnswerStart } from '@/lib/kaikai-debt/sound';

/**
 * Ask DeepSeek about the debt.
 *
 * The answer streams in over SSE, token by token, for the same reason every
 * other AI surface on this site does: the full completion takes a few seconds
 * and a joke delivered after a spinner is not one.
 *
 * ## Parsing the stream by hand
 *
 * `EventSource` cannot POST, and the question has to be a body — it is user text
 * that has no business in a URL, where it would land in access logs and browser
 * history. So this reads the `fetch` body as a stream and splits SSE frames
 * itself. The buffering matters: a frame can arrive split across two network
 * chunks, so anything after the last `\n\n` is held back rather than parsed,
 * which is the difference between a robust reader and one that drops a token
 * every few hundred characters.
 */
export function AskDebtPanel({ disabled }: { disabled?: boolean }) {
  const { t } = useTranslation('c-kaikai-debt');
  const { data: session, isPending } = useSession();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // A stream left running after the panel unmounts holds a connection open and
  // keeps calling `setState` on a dead component.
  useEffect(() => () => abortRef.current?.abort(), []);

  const signedIn = Boolean(session?.user);

  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || streaming) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreaming(true);
    setAnswer('');
    setError(null);

    try {
      const res = await fetch('/api/kaikai-debt/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body: unknown = await res.json().catch(() => null);
        setError(
          (body as { error?: string })?.error ??
            t('ask.failed', { defaultValue: 'The debt desk is not answering right now.' }),
        );
        return;
      }

      playAnswerStart();

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Everything up to the LAST frame terminator is complete; the remainder
        // may be half a frame and stays in the buffer.
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as
              | { type: 'delta'; text: string }
              | { type: 'done' }
              | { type: 'error'; message: string };
            if (event.type === 'delta') setAnswer((prev) => prev + event.text);
            else if (event.type === 'error') setError(event.message);
          } catch {
            // A malformed frame is one lost token, not a failed answer.
          }
        }
      }
    } catch (err) {
      // An abort is the user navigating or asking again — not a failure.
      if ((err as Error)?.name !== 'AbortError') {
        setError(t('ask.offline', { defaultValue: 'Network trouble. Try again.' }));
      }
    } finally {
      setStreaming(false);
    }
  }

  if (!isPending && !signedIn) {
    return (
      <div className="glass-pane flex flex-col items-start gap-3 rounded-site p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-site-text">
          <MessageCircleQuestion className="size-5 text-site-accent" aria-hidden />
          {t('ask.title', { defaultValue: 'Ask about the debt' })}
        </h2>
        <p className="text-sm text-site-text-muted">
          {t('ask.signInPrompt', {
            defaultValue:
              'The counter and the whole log are public. Asking questions runs a model, so that part needs an account.',
          })}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link to="/login" search={{ callbackURL: '/kaikaidebtcounter' }}>
            <LogIn aria-hidden />
            {t('ask.signIn', { defaultValue: 'Sign in to ask' })}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-pane flex flex-col gap-3 rounded-site p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-site-text">
        <MessageCircleQuestion className="size-5 text-site-accent" aria-hidden />
        {t('ask.title', { defaultValue: 'Ask about the debt' })}
      </h2>

      <form onSubmit={ask} className="flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION_CHARS))}
          maxLength={MAX_QUESTION_CHARS}
          disabled={streaming || disabled}
          placeholder={t('ask.placeholder', {
            defaultValue: 'What’s the stupidest thing he owes for?',
          })}
          aria-label={t('ask.label', { defaultValue: 'Ask a question about Kaikai’s debt' })}
        />
        <Button
          type="submit"
          size="sm"
          loading={streaming}
          disabled={!question.trim() || disabled}
          aria-label={t('ask.submit', { defaultValue: 'Ask' })}
        >
          <Send aria-hidden />
        </Button>
      </form>

      {(answer || error || streaming) && (
        // `polite` and not `assertive`: the answer should be announced when the
        // reader is idle, never by interrupting them mid-sentence.
        <div className="glass-inset rounded-site-sm p-4 text-sm leading-relaxed" aria-live="polite">
          {error ? (
            <p className="text-site-danger">{error}</p>
          ) : answer ? (
            <p className="text-site-text whitespace-pre-wrap">{answer}</p>
          ) : (
            <p className="text-site-text-dim">
              {t('ask.thinking', { defaultValue: 'Consulting the ledger…' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
