/**
 * The daily challenge's typing surface: the passage, live accuracy and, for a scored run, the
 * time left. Keys come from `keydown` on a visually hidden field that keeps focus and go into
 * the shared run (`lib/rmhtype/typing-run.ts`). There is no timer and no frame loop: the view,
 * the clock text included, re-renders on input and at no other time (R5).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTypingRun, type TypingRun, type TypingRunResult } from '@/lib/rmhtype/typing-run';
import { useArrival } from '@/components/ui/arrive';
import { recordKeyStats } from '@/lib/rmhtype/rmhtype.queries';
import { buildKeyStatsBody } from '@/lib/rmhtype/record-keystats';
import { useRmhTypeStore } from '@/lib/rmhtype/store';

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function DailyTyper({
  text,
  timeLeftMs,
  onDone,
}: {
  text: string;
  /** Milliseconds left on the server's clock, read on each key. Omitted for a practice run. */
  timeLeftMs?: (() => number) | undefined;
  onDone: (result: TypingRunResult) => void;
}) {
  const { t } = useTranslation('rmhtype-daily');
  const run = useRef<TypingRun>(createTypingRun(text));
  const input = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [focused, setFocused] = useState(true);
  const arrival = useArrival(true);

  useEffect(() => {
    run.current = createTypingRun(text);
    setTyped('');
    input.current?.focus();
  }, [text]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const current = run.current;
      if (current.done() || e.ctrlKey || e.metaKey || e.altKey) return;
      const at = performance.now();
      if (e.key === 'Backspace') {
        e.preventDefault();
        current.backspace(at);
        setTyped(current.typed());
        return;
      }
      if ([...e.key].length !== 1) return;
      e.preventDefault();
      // A held key is not typing: it would run up errors the member never chose.
      if (e.repeat) return;
      current.type(e.key, at);
      setTyped(current.typed());
      if (current.done()) {
        const result = current.result();
        // One request per finished run, honouring the "Record key statistics" switch; a failure is silent.
        const body = buildKeyStatsBody({
          enabled: useRmhTypeStore.getState().settings.recordKeyStats,
          finished: true,
          aggregates: result.keyStats,
        });
        if (body) recordKeyStats(body).catch(() => undefined);
        onDone(result);
      }
    },
    [onDone],
  );

  const words = text.split(' ');
  const wordIndex = text.slice(0, typed.length).split(' ').length - 1;

  return (
    <div className="space-y-4">
      {/* The one live region: the word you are on, announced as it changes, not each letter. */}
      <p className="sr-only" aria-live="polite">
        {words[wordIndex] ?? ''}
      </p>
      <input
        ref={input}
        value=""
        readOnly
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={t('input-label', {
          defaultValue: 'Type the text shown above',
        })}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="sr-only"
      />
      <div
        lang="en"
        dir="ltr"
        className={`rmhtype-passage select-none rounded-app border border-app-border p-5 text-2xl leading-relaxed ${arrival ?? ''}`}
      >
        <div aria-hidden="true">
          {[...text].map((char, i) => {
            let className = 'rmhtype-char-untyped';
            if (i < typed.length) {
              className = typed[i] === char ? 'rmhtype-char-correct' : 'rmhtype-char-incorrect';
            }
            if (i === typed.length) className += ' rmhtype-cursor';
            return (
              <span key={i} className={className}>
                {char}
              </span>
            );
          })}
        </div>
      </div>
      <p className="font-mono text-sm text-app-text-muted">
        {t('live-accuracy', {
          accuracy: Math.round(run.current.liveAccuracy()),
          defaultValue: 'Accuracy {{accuracy}}%',
        })}
        {' · '}
        {typed.length}/{text.length}
        {timeLeftMs ? (
          <>
            {' · '}
            {t('time-left', {
              time: clock(timeLeftMs()),
              defaultValue: '{{time}} left',
            })}
          </>
        ) : null}
      </p>
      {focused ? null : (
        <button type="button" onClick={() => input.current?.focus()} className="underline hover:text-app-text">
          {t('refocus', {
            defaultValue: 'Keep typing',
          })}
        </button>
      )}
    </div>
  );
}
