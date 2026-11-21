import { useId, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CopyButton } from '@/components/ui/copy-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToolFrame, ToolSection } from '@/components/toolbox/ToolFrame';
import { CASE_STYLES, convertCase, type CaseStyle } from '@/lib/toolbox/case';

function styleLabel(t: TFunction, style: CaseStyle): string {
  switch (style) {
    case 'camel':
      return t('case-camel', { ns: 'toolbox', defaultValue: 'camelCase' });
    case 'pascal':
      return t('case-pascal', { ns: 'toolbox', defaultValue: 'PascalCase' });
    case 'snake':
      return t('case-snake', { ns: 'toolbox', defaultValue: 'snake_case' });
    case 'kebab':
      return t('case-kebab', { ns: 'toolbox', defaultValue: 'kebab-case' });
    case 'constant':
      return t('case-constant', { ns: 'toolbox', defaultValue: 'CONSTANT_CASE' });
    case 'dot':
      return t('case-dot', { ns: 'toolbox', defaultValue: 'dot.case' });
    case 'path':
      return t('case-path', { ns: 'toolbox', defaultValue: 'path/case' });
    case 'title':
      return t('case-title', { ns: 'toolbox', defaultValue: 'Title Case' });
    case 'sentence':
      return t('case-sentence', { ns: 'toolbox', defaultValue: 'Sentence case' });
    case 'lower':
      return t('case-lower', { ns: 'toolbox', defaultValue: 'lower case' });
    case 'upper':
      return t('case-upper', { ns: 'toolbox', defaultValue: 'UPPER CASE' });
  }
}

export function CaseTool() {
  const { t, i18n } = useTranslation('toolbox');
  const locale = i18n.language || 'en';
  const id = useId();
  const [text, setText] = useState('');

  return (
    <ToolFrame slug="case">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{t('case-input', { defaultValue: 'Text to convert' })}</Label>
        <Textarea
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={t('case-placeholder', { defaultValue: 'For example: user profile id, one per line' })}
        />
      </div>
      <ToolSection title={t('case-results', { defaultValue: 'Every style' })}>
        <ul>
          {CASE_STYLES.map((style) => {
            const out = convertCase(text, style, locale);
            const label = styleLabel(t, style);
            return (
              <li
                key={style}
                className="flex min-h-11 items-start justify-between gap-4 border-b border-site-border py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="t-label">{label}</span>
                  <span className="min-w-0 whitespace-pre-wrap break-all font-mono text-sm">{out || '–'}</span>
                </span>
                <CopyButton
                  value={out}
                  disabled={!out}
                  label={t('case-copy', { defaultValue: 'Copy {{style}}', style: label })}
                />
              </li>
            );
          })}
        </ul>
      </ToolSection>
    </ToolFrame>
  );
}
