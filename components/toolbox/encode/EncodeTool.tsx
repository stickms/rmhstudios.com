import { useId, useMemo, useState } from 'react';
import { ArrowDownUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FieldError, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { ENCODINGS, decode, encode, type Encoding } from '@/lib/toolbox/encode';

type Mode = 'encode' | 'decode';

export function EncodeTool() {
  const { t } = useTranslation('toolbox');
  const inputId = useId();
  const outputId = useId();
  const encodingId = useId();
  const [mode, setMode] = useState<Mode>('encode');
  const [encoding, setEncoding] = useState<Encoding>('base64');
  const [text, setText] = useState('');

  const encodingName = (e: Encoding): string => {
    switch (e) {
      case 'base64':
        return t('encode-base64', { defaultValue: 'Base64' });
      case 'base64url':
        return t('encode-base64url', { defaultValue: 'Base64, URL-safe' });
      case 'url':
        return t('encode-url', { defaultValue: 'URL (percent-encoding)' });
      case 'html':
        return t('encode-html', { defaultValue: 'HTML entities' });
      case 'hex':
        return t('encode-hex', { defaultValue: 'Hexadecimal bytes' });
    }
  };

  const result = useMemo(
    () => (mode === 'encode' ? ({ ok: true, text: encode(text, encoding) } as const) : decode(text, encoding)),
    [mode, text, encoding],
  );

  const swap = () => {
    if (!result.ok) return;
    setText(result.text);
    setMode(mode === 'encode' ? 'decode' : 'encode');
  };

  return (
    <ToolFrame slug="encode">
      <Tabs
        value={mode}
        onChange={(id) => setMode(id as Mode)}
        aria-label={t('encode-mode', { defaultValue: 'Direction' })}
        tabs={[
          { id: 'encode', label: t('encode-tab-encode', { defaultValue: 'Encode' }) },
          { id: 'decode', label: t('encode-tab-decode', { defaultValue: 'Decode' }) },
        ]}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor={encodingId}>{t('encode-encoding', { defaultValue: 'Encoding' })}</Label>
        <Select id={encodingId} value={encoding} onChange={(e) => setEncoding(e.target.value as Encoding)}>
          {ENCODINGS.map((e) => (
            <option key={e} value={e}>
              {encodingName(e)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>
          {mode === 'encode'
            ? t('encode-input-plain', { defaultValue: 'Plain text' })
            : t('encode-input-encoded', { defaultValue: 'Encoded text' })}
        </Label>
        <Textarea
          id={inputId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          spellCheck={false}
          dir="ltr"
          className="font-mono"
          aria-invalid={result.ok ? undefined : true}
        />
        {!result.ok && (
          <FieldError>
            {result.reason === 'invalid-utf8'
              ? t('encode-invalid-utf8', { defaultValue: 'This decodes to bytes that are not UTF-8 text.' })
              : t('encode-invalid-input', {
                  defaultValue: 'This is not valid {{encoding}}.',
                  encoding: encodingName(encoding),
                })}
          </FieldError>
        )}
      </div>
      {result.ok && (
        <ToolSection
          title={
            mode === 'encode'
              ? t('encode-output-encoded', { defaultValue: 'Encoded' })
              : t('encode-output-decoded', { defaultValue: 'Decoded' })
          }
          action={
            <span className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={swap} disabled={!result.text}>
                <ArrowDownUp aria-hidden />
                {t('encode-swap', { defaultValue: 'Use as input' })}
              </Button>
              <CopyButton value={result.text} disabled={!result.text} />
            </span>
          }
        >
          <Label htmlFor={outputId} className="sr-only">
            {t('encode-output', { defaultValue: 'Result' })}
          </Label>
          <Textarea id={outputId} value={result.text} readOnly rows={6} spellCheck={false} className="font-mono" />
        </ToolSection>
      )}
    </ToolFrame>
  );
}
