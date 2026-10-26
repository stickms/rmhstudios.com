/**
 * Problems — validation results for the changed files (or the whole HUD on request).
 */
'use client';

import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '@/lib/tf2-hud/store';
import type { Severity } from '@/lib/tf2-hud/validate';
import { cn } from '@/lib/utils';
import { EmptyNote, PanelHead, Toggle } from './ui';
import { useValidationContext } from './validation-context';

const ICON = { error: CircleAlert, warning: AlertTriangle, info: Info } as const;
const TONE: Record<Severity, string> = {
  error: 'text-(--app-danger)',
  warning: 'text-(--app-warning)',
  info: 'text-(--app-info)',
};

export default function ProblemsPanel() {
  const { t } = useTranslation('c-tf2-hud');
  const { issues, counts, scopeAll, setScopeAll } = useValidationContext();
  const jump = useEditor((s) => s.jump);
  const [showInfo, setShowInfo] = useState(false);
  const list = issues.filter((i) => showInfo || i.severity !== 'info');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead
        title={t('problems', { defaultValue: 'Problems' })}
        actions={
          <span className="text-[11px] text-(--app-text-muted)">
            {counts.error} · {counts.warning} · {counts.info}
          </span>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-(--app-border) px-3 py-2 text-xs text-(--app-text-muted)">
        <label className="flex items-center gap-2">
          <Toggle
            label={t('check-all', { defaultValue: 'Check every file' })}
            checked={scopeAll}
            onChange={setScopeAll}
          />
          {t('check-all', { defaultValue: 'Check every file' })}
        </label>
        <label className="flex items-center gap-2">
          <Toggle
            label={t('show-info', { defaultValue: 'Show texture notes' })}
            checked={showInfo}
            onChange={setShowInfo}
          />
          {t('show-info', { defaultValue: 'Show texture notes' })}
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <EmptyNote>
            {scopeAll
              ? t('all-clear-all', { defaultValue: 'No problems found in any file.' })
              : t('all-clear', { defaultValue: 'No problems in your changed files.' })}
          </EmptyNote>
        ) : (
          <ul>
            {list.map((i) => {
              const Icon = ICON[i.severity];
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => jump(i.path, i.offset ?? 0)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-start hover:bg-(--app-surface-hover)"
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[i.severity])} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-xs text-(--app-text)">{i.message}</span>
                      <span className="block truncate font-mono text-[11px] text-(--app-text-dim)">
                        {i.path}
                        {i.line ? `:${i.line}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
