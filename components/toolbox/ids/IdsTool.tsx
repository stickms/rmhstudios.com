import { useCallback, useEffect, useId, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { ID_KINDS, entropyBits, generateId, inspectId, type IdKind } from '@/lib/toolbox/ids';

const MAX_COUNT = 1000;

export function IdsTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const kindId = useId();
  const countId = useId();
  const sizeId = useId();
  const outputId = useId();
  const inspectInputId = useId();
  const [kind, setKind] = useState<IdKind>('uuid-v4');
  const [count, setCount] = useState(5);
  const [size, setSize] = useState(21);
  const [ids, setIds] = useState<string[]>([]);
  const [probe, setProbe] = useState('');

  const kindName = (k: IdKind): string => {
    switch (k) {
      case 'uuid-v4':
        return t('ids-uuid-v4', { defaultValue: 'UUID version 4 (random)' });
      case 'uuid-v7':
        return t('ids-uuid-v7', { defaultValue: 'UUID version 7 (time-ordered)' });
      case 'ulid':
        return t('ids-ulid', { defaultValue: 'ULID' });
      case 'nanoid':
        return t('ids-nanoid', { defaultValue: 'Nano ID' });
    }
  };

  const generate = useCallback(() => {
    const n = Math.min(MAX_COUNT, Math.max(1, Math.floor(count) || 1));
    const s = Math.min(64, Math.max(4, Math.floor(size) || 21));
    setIds(Array.from({ length: n }, () => generateId(kind, { size: s })));
  }, [kind, count, size]);

  // IDs are random, so they are made in the browser after hydration, never during SSR.
  useEffect(() => {
    generate();
  }, [generate]);

  const info = probe.trim() ? inspectId(probe) : null;
  const all = ids.join('\n');
  const formatTime = (d: Date) =>
    Number.isNaN(d.getTime())
      ? t('ids-time-invalid', { defaultValue: 'Not a valid time' })
      : `${new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'medium' }).format(d)} (${d.toISOString()})`;

  return (
    <ToolFrame slug="ids">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-3">
          <Label htmlFor={kindId}>{t('ids-kind', { defaultValue: 'Kind' })}</Label>
          <Select id={kindId} value={kind} onChange={(e) => setKind(e.target.value as IdKind)}>
            {ID_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindName(k)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={countId}>{t('ids-count', { defaultValue: 'How many' })}</Label>
          <Input
            id={countId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_COUNT}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        {kind === 'nanoid' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={sizeId}>{t('ids-size', { defaultValue: 'Length' })}</Label>
            <Input
              id={sizeId}
              type="number"
              inputMode="numeric"
              min={4}
              max={64}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </div>
        )}
      </div>
      <p className="t-meta">
        {t('ids-entropy', {
          defaultValue: '{{bits}} random bits per ID.',
          bits: entropyBits(kind, Math.min(64, Math.max(4, Math.floor(size) || 21))),
        })}
      </p>
      <div>
        <Button variant="primary" onClick={generate}>
          <RefreshCw aria-hidden />
          {t('ids-generate', { defaultValue: 'Generate' })}
        </Button>
      </div>

      <ToolSection
        title={t('ids-output', { defaultValue: 'IDs' })}
        action={<CopyButton value={all} disabled={!all} label={t('ids-copy-all', { defaultValue: 'Copy all' })} />}
      >
        <Label htmlFor={outputId} className="sr-only">
          {t('ids-output', { defaultValue: 'IDs' })}
        </Label>
        <Textarea
          id={outputId}
          value={all}
          readOnly
          rows={Math.min(12, Math.max(3, ids.length))}
          spellCheck={false}
          dir="ltr"
          className="font-mono"
        />
      </ToolSection>

      <ToolSection title={t('ids-inspect', { defaultValue: 'Inspect an ID' })}>
        <Label htmlFor={inspectInputId} className="sr-only">
          {t('ids-inspect-input', { defaultValue: 'ID to inspect' })}
        </Label>
        <Input
          id={inspectInputId}
          value={probe}
          onChange={(e) => setProbe(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          dir="ltr"
          className="font-mono"
          placeholder={t('ids-inspect-placeholder', { defaultValue: 'Paste a UUID or ULID' })}
        />
        {info && (
          <div aria-live="polite">
            {info.kind === 'unknown' && (
              <p className="t-body text-site-text-muted">
                {t('ids-unknown', { defaultValue: 'This is not a UUID or a ULID.' })}
              </p>
            )}
            {info.kind === 'uuid' && (
              <>
                <ResultRow
                  label={t('ids-format', { defaultValue: 'Format' })}
                  mono={false}
                  value={
                    info.nil
                      ? t('ids-nil', { defaultValue: 'The nil UUID' })
                      : info.max
                        ? t('ids-max', { defaultValue: 'The max UUID' })
                        : t('ids-uuid-version', { defaultValue: 'UUID version {{version}}', version: info.version })
                  }
                />
                {!info.nil && !info.max && (
                  <ResultRow
                    label={t('ids-variant', { defaultValue: 'Variant' })}
                    mono={false}
                    value={
                      info.variant === 'rfc'
                        ? t('ids-variant-rfc', { defaultValue: 'RFC 9562' })
                        : info.variant === 'microsoft'
                          ? t('ids-variant-microsoft', { defaultValue: 'Microsoft (legacy GUID)' })
                          : info.variant === 'ncs'
                            ? t('ids-variant-ncs', { defaultValue: 'NCS (legacy)' })
                            : t('ids-variant-future', { defaultValue: 'Reserved' })
                    }
                  />
                )}
                {info.time && (
                  <ResultRow label={t('ids-created', { defaultValue: 'Created' })} value={formatTime(info.time)} />
                )}
              </>
            )}
            {info.kind === 'ulid' && (
              <>
                <ResultRow
                  label={t('ids-format', { defaultValue: 'Format' })}
                  mono={false}
                  value={t('ids-ulid', { defaultValue: 'ULID' })}
                />
                <ResultRow label={t('ids-created', { defaultValue: 'Created' })} value={formatTime(info.time)} />
              </>
            )}
          </div>
        )}
      </ToolSection>
    </ToolFrame>
  );
}
