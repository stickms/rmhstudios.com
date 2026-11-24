import { useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CopyButton } from '@/components/ui/copy-button';
import { FieldError, ResultRow, ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import {
  CONTRAST_CHECKS,
  CONTRAST_THRESHOLDS,
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  contrastRatio,
  formatRatio,
  parseColor,
  passes,
  suggestForeground,
  toHex,
  type ContrastCheck,
  type Rgb,
} from '@/lib/toolbox/contrast';

function ColorField({
  label,
  value,
  onChange,
  parsed,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  parsed: Rgb | null;
}) {
  const { t } = useTranslation('toolbox');
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={t('contrast-picker', { defaultValue: '{{label}} picker', label })}
          value={parsed ? toHex(parsed) : DEFAULT_BACKGROUND}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-site border border-site-border bg-site-surface"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={parsed ? undefined : true}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
        />
      </div>
      {!parsed && (
        <FieldError>
          {t('contrast-invalid', { defaultValue: 'Enter a colour as #rrggbb, rgb(…) or hsl(…).' })}
        </FieldError>
      )}
    </div>
  );
}

function checkLabel(t: TFunction, check: ContrastCheck): string {
  switch (check) {
    case 'aa-normal':
      return t('contrast-aa-normal', { ns: 'toolbox', defaultValue: 'AA, body text' });
    case 'aa-large':
      return t('contrast-aa-large', { ns: 'toolbox', defaultValue: 'AA, large text' });
    case 'aaa-normal':
      return t('contrast-aaa-normal', { ns: 'toolbox', defaultValue: 'AAA, body text' });
    case 'aaa-large':
      return t('contrast-aaa-large', { ns: 'toolbox', defaultValue: 'AAA, large text' });
    case 'ui':
      return t('contrast-ui', { ns: 'toolbox', defaultValue: 'Controls and graphics' });
  }
}

export function ContrastTool({
  initialForeground = DEFAULT_FOREGROUND,
  initialBackground = DEFAULT_BACKGROUND,
  onPairChange,
}: {
  initialForeground?: string;
  initialBackground?: string;
  /** Called with valid hex values so the route can keep the pair in the URL. */
  onPairChange?: (fg: string, bg: string) => void;
}) {
  const { t } = useTranslation('toolbox');
  const [fgText, setFgText] = useState(initialForeground);
  const [bgText, setBgText] = useState(initialBackground);
  const fg = parseColor(fgText);
  const bg = parseColor(bgText);

  const update = (nextFg: string, nextBg: string) => {
    setFgText(nextFg);
    setBgText(nextBg);
    const a = parseColor(nextFg);
    const b = parseColor(nextBg);
    if (a && b) onPairChange?.(toHex(a), toHex(b));
  };

  const ratio = fg && bg ? contrastRatio(fg, bg) : null;
  const suggestion =
    fg && bg && ratio !== null && ratio < CONTRAST_THRESHOLDS['aa-normal']
      ? suggestForeground(fg, bg, CONTRAST_THRESHOLDS['aa-normal'])
      : null;

  return (
    <ToolFrame slug="contrast">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField
          label={t('contrast-foreground', { defaultValue: 'Text colour' })}
          value={fgText}
          onChange={(v) => update(v, bgText)}
          parsed={fg}
        />
        <ColorField
          label={t('contrast-background', { defaultValue: 'Background colour' })}
          value={bgText}
          onChange={(v) => update(fgText, v)}
          parsed={bg}
        />
      </div>
      <div>
        <Button variant="default" onClick={() => update(bgText, fgText)}>
          <ArrowLeftRight aria-hidden />
          {t('contrast-swap', { defaultValue: 'Swap colours' })}
        </Button>
      </div>

      {fg && bg && ratio !== null && (
        <>
          <div
            className="flex flex-col gap-2 rounded-site border border-site-border p-5"
            style={{ color: toHex(fg), backgroundColor: toHex(bg) }}
          >
            <p className="t-heading">{t('contrast-sample-large', { defaultValue: 'Large text sample' })}</p>
            <p className="t-body">
              {t('contrast-sample-body', {
                defaultValue: 'Body text sample. The quick brown fox jumps over the lazy dog.',
              })}
            </p>
          </div>

          <ToolSection title={t('contrast-results', { defaultValue: 'Results' })}>
            <p className="t-title font-mono" aria-live="polite">
              {t('contrast-ratio', { defaultValue: '{{ratio}}:1', ratio: formatRatio(ratio) })}
            </p>
            <div>
              {CONTRAST_CHECKS.map((check) => {
                const ok = passes(ratio, check);
                return (
                  <ResultRow
                    key={check}
                    label={`${checkLabel(t, check)} (${CONTRAST_THRESHOLDS[check]}:1)`}
                    mono={false}
                    value={
                      <span
                        className={
                          ok
                            ? 'inline-flex items-center gap-1 text-site-success'
                            : 'inline-flex items-center gap-1 text-site-danger'
                        }
                      >
                        {ok ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
                        {ok
                          ? t('contrast-pass', { defaultValue: 'Pass' })
                          : t('contrast-fail', { defaultValue: 'Fail' })}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </ToolSection>

          {suggestion && (
            <ToolSection title={t('contrast-suggestion', { defaultValue: 'Nearest passing text colour' })}>
              <p className="t-body text-site-text-muted">
                {t('contrast-suggestion-body', {
                  defaultValue: 'The same hue at the closest lightness that reaches 4.5:1 on this background.',
                })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  aria-hidden
                  className="size-10 rounded-site border border-site-border"
                  style={{ backgroundColor: toHex(suggestion) }}
                />
                <span className="font-mono text-sm">{toHex(suggestion)}</span>
                <CopyButton value={toHex(suggestion)} />
                <Button variant="default" onClick={() => update(toHex(suggestion), bgText)}>
                  {t('contrast-use-suggestion', { defaultValue: 'Use this colour' })}
                </Button>
              </div>
            </ToolSection>
          )}
        </>
      )}
    </ToolFrame>
  );
}
