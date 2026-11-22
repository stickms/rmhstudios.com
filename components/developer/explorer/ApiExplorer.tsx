import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ENDPOINTS, endpointsByGroup, type ApiEndpoint } from '@/lib/api/registry';
import { removeKey, readString, writeString } from '@/lib/core/persist';
import {
  buildRequest,
  docsPathForGroup,
  exampleBody,
  hasRequestBody,
  isTestKey,
  missingRequired,
  parseJsonWithPosition,
  type ExplorerRequest,
} from '@/lib/developer/explorer';
import { docsUrl } from '@/lib/docs-site';
import { EndpointList } from './EndpointList';
import { KeyPanel } from './KeyPanel';
import { RequestForm } from './RequestForm';
import { RESPONSE_HEADERS, ResponseView, type ResponseState } from './ResponseView';
import { SnippetTabs } from './SnippetTabs';

const KEY_STORAGE = 'rmh-explorer-key';

interface ApiExplorerProps {
  /** The `op` search param: an operationId, or undefined. */
  op: string | undefined;
  onSelect: (operationId: string) => void;
}

interface WorkbenchProps {
  endpoint: ApiEndpoint;
  apiKey: string;
  includeKey: boolean;
  onIncludeKey: (include: boolean) => void;
  focusOnMount: boolean;
}

/** One endpoint: its form, Send, the response and the snippets. Remounted per endpoint so values never carry over. */
function Workbench({ endpoint, apiKey, includeKey, onIncludeKey, focusOnMount }: WorkbenchProps) {
  const { t } = useTranslation('dev-explorer');
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState(() => exampleBody(endpoint));
  const [confirmed, setConfirmed] = useState(false);
  const [response, setResponse] = useState<ResponseState>({ phase: 'idle' });
  const heading = useRef<HTMLHeadingElement>(null);
  const inflight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  useEffect(() => () => inflight.current?.abort(), []);

  const trimmedKey = apiKey.trim();
  const live = trimmedKey !== '' && !isTestKey(trimmedKey);
  const needsConfirm = live && endpoint.method !== 'GET';
  const missing = missingRequired(endpoint, params);
  const bodyCheck = useMemo(
    () => (hasRequestBody(endpoint) && body.trim() ? parseJsonWithPosition(body) : null),
    [endpoint, body],
  );
  const bodyInvalid = bodyCheck !== null && !bodyCheck.ok;

  const request = useMemo((): ExplorerRequest | null => {
    if (missing.length > 0) return null;
    return buildRequest(endpoint, { params, body, key: trimmedKey });
  }, [endpoint, params, body, trimmedKey, missing.length]);

  const canSend = request !== null && !bodyInvalid && response.phase !== 'sending' && (!needsConfirm || confirmed);
  const docs = docsPathForGroup(endpoint.group);

  async function send() {
    if (!request) return;
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setResponse({ phase: 'sending' });
    const started = performance.now();
    try {
      // The URL comes from `buildRequest`, which only ever yields `/api/v1/**`. No cookies: this exercises key auth.
      const res = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        credentials: 'omit',
        signal: controller.signal,
      });
      const raw = await res.text();
      const durationMs = Math.round(performance.now() - started);
      const parsed = raw ? parseJsonWithPosition(raw) : null;
      setResponse({
        phase: 'done',
        status: res.status,
        statusText: res.statusText,
        durationMs,
        headers: RESPONSE_HEADERS.flatMap((name) => {
          const value = res.headers.get(name);
          return value === null ? [] : [{ name, value }];
        }),
        text: parsed?.ok ? JSON.stringify(parsed.value, null, 2) : raw,
      });
    } catch {
      if (!controller.signal.aborted) setResponse({ phase: 'failed' });
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 ref={heading} tabIndex={-1} dir="ltr" className="t-heading break-all outline-offset-4">
          <span className="font-mono">
            {endpoint.method} {endpoint.path}
          </span>
        </h2>
        <p className="t-post font-medium">{endpoint.summary}</p>
        <p className="t-body text-site-text-muted">{endpoint.description}</p>
        <p className="t-meta">
          {endpoint.scope
            ? t('detail-scope', { defaultValue: 'Scope: {{scope}}', scope: endpoint.scope })
            : t('detail-no-scope', { defaultValue: 'No scope required.' })}
          {docs ? (
            <>
              {' · '}
              <a href={docsUrl(docs)} target="_blank" rel="noreferrer" className="underline">
                {t('detail-docs', { defaultValue: 'Read the docs' })}
                <ExternalLink aria-hidden className="ms-1 inline size-3" />
                <span className="sr-only">{t('detail-opens-new-tab', { defaultValue: '(opens in a new tab)' })}</span>
              </a>
            </>
          ) : null}
        </p>
      </header>

      <RequestForm
        endpoint={endpoint}
        params={params}
        onParam={(name, value) => setParams((p) => ({ ...p, [name]: value }))}
        body={body}
        onBody={setBody}
        bodyCheck={bodyCheck}
      />

      <div className="space-y-3">
        {needsConfirm ? (
          <label className="t-body flex items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="size-4"
            />
            {t('send-confirm', { defaultValue: 'This changes real data' })}
          </label>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" disabled={!canSend} onClick={() => void send()}>
            <Send aria-hidden /> {t('send', { defaultValue: 'Send request' })}
          </Button>
          {missing.length > 0 ? (
            <p className="t-meta">
              {t('send-missing', {
                defaultValue: 'Required: {{names}}',
                names: missing.join(', '),
              })}
            </p>
          ) : null}
        </div>
      </div>

      <ResponseView state={response} />
      <SnippetTabs request={request} hasKey={trimmedKey !== ''} includeKey={includeKey} onIncludeKey={onIncludeKey} />
    </div>
  );
}

/** The explorer: endpoint list on the left, the selected endpoint's workbench on the right (one column on a phone). */
export function ApiExplorer({ op, onSelect }: ApiExplorerProps) {
  const { t } = useTranslation('dev-explorer');
  const groups = useMemo(() => endpointsByGroup(), []);
  const endpoint = useMemo(() => ENDPOINTS.find((e) => e.operationId === op) ?? null, [op]);
  const [filter, setFilter] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keep, setKeep] = useState(false);
  const [includeKey, setIncludeKey] = useState(false);
  const picked = useRef(false);

  // A key kept for this tab is read once on the client, after hydration.
  useEffect(() => {
    const stored = readString(KEY_STORAGE, { storage: 'session' });
    if (stored) {
      setApiKey(stored);
      setKeep(true);
    }
  }, []);

  function changeKey(value: string) {
    setApiKey(value);
    if (keep) writeString(KEY_STORAGE, value, { storage: 'session' });
  }

  function changeKeep(on: boolean) {
    setKeep(on);
    if (on) writeString(KEY_STORAGE, apiKey, { storage: 'session' });
    else removeKey(KEY_STORAGE, { storage: 'session' });
  }

  return (
    <div className="grid gap-8 px-4 pt-4 pb-12 lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-0">
      <div className="lg:pe-6">
        <EndpointList
          groups={groups}
          selectedId={endpoint?.operationId ?? null}
          filter={filter}
          onFilter={setFilter}
          onSelect={(id) => {
            picked.current = true;
            onSelect(id);
          }}
        />
      </div>
      <div className="space-y-6 lg:border-s lg:border-site-border lg:ps-6">
        <KeyPanel value={apiKey} onChange={changeKey} isTest={isTestKey(apiKey)} keep={keep} onKeep={changeKeep} />
        {endpoint ? (
          <Workbench
            key={endpoint.operationId}
            endpoint={endpoint}
            apiKey={apiKey}
            includeKey={includeKey}
            onIncludeKey={setIncludeKey}
            focusOnMount={picked.current}
          />
        ) : (
          <EmptyState
            title={t('empty-title', { defaultValue: 'Choose an endpoint' })}
            description={t('empty-description', {
              defaultValue: 'Pick one from the list to fill in its parameters and send a request.',
            })}
          />
        )}
      </div>
    </div>
  );
}
