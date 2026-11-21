import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { FieldError, ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { WIDTHS, bitLength, formatInBase, groupDigits, parseInBase, widthView } from '@/lib/toolbox/base';

const COMMON = [
  { base: 2, group: 4 },
  { base: 8, group: 3 },
  { base: 10, group: 3 },
  { base: 16, group: 4 },
] as const;

const ALL_BASES = Array.from({ length: 35 }, (_, i) => i + 2);

export function BaseTool() {
  const { t } = useTranslation('toolbox');
  const valueId = useId();
  const fromId = useId();
  const customId = useId();
  const [text, setText] = useState('255');
  const [from, setFrom] = useState(10);
  const [custom, setCustom] = useState(36);
  const parsed = parseInBase(text, from);

  const baseName = (base: number): string => {
    switch (base) {
      case 2:
        return t('base-binary', { defaultValue: 'Binary' });
      case 8:
        return t('base-octal', { defaultValue: 'Octal' });
      case 10:
        return t('base-decimal', { defaultValue: 'Decimal' });
      case 16:
        return t('base-hex', { defaultValue: 'Hexadecimal' });
      default:
        return t('base-n', { defaultValue: 'Base {{base}}', base });
    }
  };

  return (
    <ToolFrame slug="base">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={valueId}>{t('base-value', { defaultValue: 'Number' })}</Label>
          <Input
            id={valueId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            dir="ltr"
            className="font-mono"
            aria-invalid={parsed.ok ? undefined : true}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={fromId}>{t('base-from', { defaultValue: 'Written in' })}</Label>
          <Select id={fromId} value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {ALL_BASES.map((b) => (
              <option key={b} value={b}>
                {baseName(b)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {!parsed.ok && (
        <FieldError>
          {parsed.reason === 'bad-digit'
            ? t('base-bad-digit', {
                defaultValue: '“{{digit}}” is not a digit in base {{base}}.',
                digit: parsed.digit ?? '',
                base: from,
              })
            : t('base-empty', { defaultValue: 'Enter a whole number.' })}
        </FieldError>
      )}

      {parsed.ok && (
        <>
          <ToolSection title={t('base-results', { defaultValue: 'In other bases' })}>
            <div>
              {COMMON.map(({ base, group }) => {
                const digits = formatInBase(parsed.value, base);
                return (
                  <ResultRow
                    key={base}
                    label={baseName(base)}
                    value={groupDigits(digits, group)}
                    action={<CopyButton value={digits} label={t('base-copy', { defaultValue: 'Copy' })} />}
                  />
                );
              })}
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-site-border py-2">
                <Label htmlFor={customId} className="sr-only">
                  {t('base-custom', { defaultValue: 'Another base' })}
                </Label>
                <Select
                  id={customId}
                  controlSize="sm"
                  value={custom}
                  onChange={(e) => setCustom(Number(e.target.value))}
                  containerClassName="w-40"
                >
                  {ALL_BASES.map((b) => (
                    <option key={b} value={b}>
                      {baseName(b)}
                    </option>
                  ))}
                </Select>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="break-all font-mono text-sm">{formatInBase(parsed.value, custom)}</span>
                  <CopyButton value={formatInBase(parsed.value, custom)} />
                </span>
              </div>
              <ResultRow
                label={t('base-bits', { defaultValue: 'Bits needed' })}
                value={bitLength(parsed.value)}
              />
            </div>
          </ToolSection>

          <ToolSection title={t('base-widths', { defaultValue: 'Fixed-width integers' })}>
            <ul>
              {WIDTHS.map((width) => {
                const view = widthView(parsed.value, width);
                return (
                  <li key={width} className="flex flex-col gap-1 border-b border-site-border py-2 last:border-b-0">
                    <span className="t-label">{t('base-width', { defaultValue: '{{width}}-bit', width })}</span>
                    {view.fits ? (
                      <>
                        <span className="break-all font-mono text-sm">{groupDigits(view.bits ?? '', 4)}</span>
                        <span className="t-meta">
                          {t('base-width-readings', {
                            defaultValue: 'hex {{hex}} · unsigned {{unsigned}} · signed {{signed}}',
                            hex: view.hex,
                            unsigned: String(view.unsigned),
                            signed: String(view.signed),
                          })}
                        </span>
                      </>
                    ) : (
                      <span className="t-body text-site-text-muted">
                        {t('base-width-overflow', { defaultValue: 'Does not fit in {{width}} bits.', width })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </ToolSection>
        </>
      )}
    </ToolFrame>
  );
}
