import { useEffect, useId, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import {
  HASH_ALGORITHMS,
  WEAK_ALGORITHMS,
  digestAll,
  matchDigest,
  normaliseHash,
  type HashAlgorithm,
} from '@/lib/toolbox/hash';

type Source = 'text' | 'file';

export function HashTool() {
  const { t, i18n } = useTranslation('toolbox');
  const textId = useId();
  const fileId = useId();
  const expectId = useId();
  const [source, setSource] = useState<Source>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [digests, setDigests] = useState<Record<HashAlgorithm, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [expected, setExpected] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (source === 'file' && !file) {
        setDigests(null);
        return;
      }
      setBusy(true);
      const data =
        source === 'text' ? new TextEncoder().encode(text) : new Uint8Array(await (file as File).arrayBuffer());
      const next = await digestAll(data);
      if (!cancelled) {
        setDigests(next);
        setBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [source, text, file]);

  const match = digests && expected.trim() ? matchDigest(expected, digests) : null;
  const expectedValid = expected.trim() === '' || normaliseHash(expected) !== null;

  return (
    <ToolFrame slug="hash">
      <Tabs
        value={source}
        onChange={(id) => setSource(id as Source)}
        aria-label={t('hash-source', { defaultValue: 'What to hash' })}
        tabs={[
          { id: 'text', label: t('hash-tab-text', { defaultValue: 'Text' }) },
          { id: 'file', label: t('hash-tab-file', { defaultValue: 'File' }) },
        ]}
      />
      {source === 'text' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={textId}>{t('hash-text', { defaultValue: 'Text, as UTF-8' })}</Label>
          <Textarea id={textId} value={text} onChange={(e) => setText(e.target.value)} rows={5} spellCheck={false} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={fileId}>{t('hash-file', { defaultValue: 'File' })}</Label>
          <Input id={fileId} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="pt-2" />
          {file && (
            <p className="t-meta">
              {t('hash-file-size', {
                defaultValue: '{{name}}, {{size}} bytes. The file is read on this device and never uploaded.',
                name: file.name,
                size: new Intl.NumberFormat(i18n.language || 'en').format(file.size),
              })}
            </p>
          )}
        </div>
      )}

      {digests && (
        <ToolSection title={t('hash-results', { defaultValue: 'Digests' })}>
          <ul aria-busy={busy}>
            {HASH_ALGORITHMS.map((algorithm) => (
              <li
                key={algorithm}
                className="flex items-start justify-between gap-3 border-b border-site-border py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="t-label">
                    {WEAK_ALGORITHMS.has(algorithm)
                      ? t('hash-weak', { defaultValue: '{{algorithm}}, checksums only', algorithm })
                      : algorithm}
                  </span>
                  <span className="break-all font-mono text-sm">{digests[algorithm]}</span>
                </span>
                <CopyButton
                  value={digests[algorithm]}
                  label={t('hash-copy', { defaultValue: 'Copy {{algorithm}}', algorithm })}
                />
              </li>
            ))}
          </ul>
        </ToolSection>
      )}

      <ToolSection title={t('hash-verify', { defaultValue: 'Verify a checksum' })}>
        <Label htmlFor={expectId} className="sr-only">
          {t('hash-expected', { defaultValue: 'Expected checksum' })}
        </Label>
        <Input
          id={expectId}
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          dir="ltr"
          className="font-mono"
          placeholder={t('hash-expected-placeholder', { defaultValue: 'Paste the published checksum' })}
          aria-invalid={expectedValid ? undefined : true}
        />
        {expected.trim() !== '' && digests && (
          <p
            role="status"
            className={
              match
                ? 'inline-flex items-center gap-2 t-body text-site-success'
                : 'inline-flex items-center gap-2 t-body text-site-danger'
            }
          >
            {match ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
            {match
              ? t('hash-match', { defaultValue: 'Matches the {{algorithm}} digest.', algorithm: match })
              : expectedValid
                ? t('hash-no-match', { defaultValue: 'Does not match any digest above.' })
                : t('hash-not-hex', { defaultValue: 'A checksum is hexadecimal: 0–9 and a–f.' })}
          </p>
        )}
      </ToolSection>
    </ToolFrame>
  );
}
