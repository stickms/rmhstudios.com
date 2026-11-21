import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export const RESPONSE_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'Retry-After',
  'X-Request-Id',
] as const;

export type ResponseState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'failed' }
  | {
      phase: 'done';
      status: number;
      statusText: string;
      durationMs: number;
      headers: { name: string; value: string }[];
      /** Pretty-printed when the body was JSON, otherwise as received. */
      text: string;
    };

function Done({ state }: { state: Extract<ResponseState, { phase: 'done' }> }) {
  const { t } = useTranslation('dev-explorer');
  const arrival = useArrival(true);
  return (
    <div className={cn('space-y-3', arrival)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {state.headers.map((h) => (
          <div key={h.name} className="contents">
            <dt dir="ltr" className="t-meta">
              {h.name}
            </dt>
            <dd dir="ltr" className="t-meta break-all text-site-text">
              {h.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-2">
        <h3 className="t-label">{t('response-body', { defaultValue: 'Body' })}</h3>
        <CopyButton value={state.text} label={t('response-copy', { defaultValue: 'Copy response' })} />
      </div>
      <pre
        dir="ltr"
        tabIndex={0}
        aria-label={t('response-body-label', { defaultValue: 'Response body' })}
        className="t-meta max-h-[28rem] overflow-auto rounded-site border border-site-border bg-site-bg-subtle p-3 whitespace-pre-wrap break-all text-site-text"
      >
        {state.text || t('response-empty-body', { defaultValue: '(empty body)' })}
      </pre>
    </div>
  );
}

/** Status, timing, rate-limit headers and the body. The body is always text, never HTML. */
export function ResponseView({ state }: { state: ResponseState }) {
  const { t } = useTranslation('dev-explorer');

  // The live region announces the status only; the body and headers are read on demand.
  let status: string;
  if (state.phase === 'done') {
    status = t('response-status', {
      defaultValue: '{{status}} {{text}} in {{ms}} ms',
      status: state.status,
      text: state.statusText,
      ms: state.durationMs,
    });
  } else if (state.phase === 'sending') {
    status = t('response-sending', { defaultValue: 'Sending' });
  } else if (state.phase === 'failed') {
    status = t('response-failed', {
      defaultValue: 'The request did not complete. Check your connection and try again.',
    });
  } else {
    status = '';
  }

  return (
    <section aria-labelledby="explorer-response-heading" className="space-y-3">
      <h2 id="explorer-response-heading" className="t-heading">
        {t('response-heading', { defaultValue: 'Response' })}
      </h2>
      <p
        role="status"
        aria-live="polite"
        dir="ltr"
        className={cn(
          't-body font-medium',
          state.phase === 'failed' || (state.phase === 'done' && state.status >= 400) ? 'text-site-danger' : '',
        )}
      >
        {status}
      </p>
      {state.phase === 'idle' ? (
        <p className="t-body text-site-text-muted">
          {t('response-idle', { defaultValue: 'Send the request to see the response here.' })}
        </p>
      ) : null}
      {state.phase === 'sending' ? <Skeleton className="h-24 w-full" /> : null}
      {state.phase === 'done' ? <Done state={state} /> : null}
    </section>
  );
}
