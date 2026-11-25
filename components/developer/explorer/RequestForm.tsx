import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ApiEndpoint, ApiParam } from '@/lib/api/registry';
import { hasRequestBody, type JsonParse } from '@/lib/developer/explorer';

interface RequestFormProps {
  endpoint: ApiEndpoint;
  params: Readonly<Record<string, string>>;
  onParam: (name: string, value: string) => void;
  body: string;
  onBody: (value: string) => void;
  /** The body's parse result; a failure is reported under the editor. */
  bodyCheck: JsonParse | null;
}

function ParamField({ param, value, onChange }: { param: ApiParam; value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('dev-explorer');
  const id = useId();
  const labelId = `${id}-label`;
  const where =
    param.in === 'path' ? t('param-path', { defaultValue: 'path' }) : t('param-query', { defaultValue: 'query' });
  const required = param.required || param.in === 'path';
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <label id={labelId} htmlFor={param.type === 'boolean' ? undefined : id} className="t-label text-site-text">
          <span dir="ltr" className="font-mono">
            {param.name}
          </span>
        </label>
        <span className="t-meta">
          {where} · {param.type}
          {required ? ` · ${t('param-required', { defaultValue: 'required' })}` : ''}
        </span>
      </div>
      {param.type === 'boolean' ? (
        <Switch
          checked={value === 'true'}
          onCheckedChange={(on) => onChange(on ? 'true' : '')}
          aria-labelledby={labelId}
        />
      ) : (
        <Input
          aria-labelledby={labelId}
          id={id}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={param.type === 'integer' ? 'numeric' : undefined}
          aria-required={required || undefined}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {param.description ? <p className="t-meta">{param.description}</p> : null}
    </div>
  );
}

/** Path and query parameters as typed inputs, and a JSON editor for endpoints that take a body. */
export function RequestForm({ endpoint, params, onParam, body, onBody, bodyCheck }: RequestFormProps) {
  const { t } = useTranslation('dev-explorer');
  const bodyId = useId();
  const errorId = `${bodyId}-error`;
  const list = endpoint.params ?? [];
  const failure = bodyCheck && !bodyCheck.ok ? bodyCheck : null;

  if (list.length === 0 && !hasRequestBody(endpoint)) {
    return (
      <p className="t-body text-site-text-muted">
        {t('form-none', { defaultValue: 'This endpoint takes no parameters.' })}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {list.map((p) => (
        <ParamField
          key={`${p.in}:${p.name}`}
          param={p}
          value={params[p.name] ?? ''}
          onChange={(v) => onParam(p.name, v)}
        />
      ))}
      {hasRequestBody(endpoint) ? (
        <div className="space-y-1">
          <label htmlFor={bodyId} className="t-label text-site-text">
            {t('form-body', { defaultValue: 'JSON body' })}
          </label>
          <Textarea
            id={bodyId}
            dir="ltr"
            value={body}
            onChange={(e) => onBody(e.target.value)}
            rows={10}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={failure ? true : undefined}
            aria-describedby={failure ? errorId : undefined}
            className="t-meta font-mono"
          />
          {failure ? (
            <p id={errorId} role="alert" className="t-meta text-site-danger">
              {t('form-body-invalid', {
                defaultValue: 'Invalid JSON at line {{line}}, column {{column}}.',
                line: failure.line,
                column: failure.column,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
