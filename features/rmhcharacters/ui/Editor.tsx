/**
 * The editor frame both systems share: name, the tab strip, export and print.
 * The tabs' content comes from the system's own editor.
 */
import { useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, Check, CloudOff, Download, Loader2, Printer, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/lib/shared/app-toast';
import { SYSTEM_LABEL } from '@features/rmhcharacters/engine/data';
import { EXPORTS, exportCharacter, type ExportFormat } from '@features/rmhcharacters/engine/formats';
import { useRoster } from '@features/rmhcharacters/engine/store';
import type { Pending } from '@features/rmhcharacters/engine/pending';
import type { Character } from '@features/rmhcharacters/engine/types';
import { downloadText } from './useData';

export type EditorTab = 'build' | 'sheet' | 'spells' | 'inventory' | 'story' | 'advisor';

export function EditorFrame({
  character,
  subtitle,
  panels,
  pending,
  onBack,
  onLevelUp,
  tab,
  onTab,
}: {
  character: Character;
  subtitle: string;
  panels: Record<EditorTab, ReactNode>;
  /** Unmade choices, badged on their tabs. */
  pending: Pending;
  onBack: () => void;
  onLevelUp: (() => void) | null;
  tab: EditorTab;
  onTab: (t: EditorTab) => void;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const update = useRoster((s) => s.update);
  const [exporting, setExporting] = useState(false);
  const tabs = [
    { id: 'build', label: t('tab.build', { defaultValue: 'Build' }), ...(pending.build ? { badge: pending.build } : {}) },
    { id: 'sheet', label: t('tab.sheet', { defaultValue: 'Sheet' }) },
    { id: 'spells', label: t('tab.spells', { defaultValue: 'Spells' }), ...(pending.spells ? { badge: pending.spells } : {}) },
    { id: 'inventory', label: t('tab.inventory', { defaultValue: 'Inventory' }) },
    { id: 'story', label: t('tab.story', { defaultValue: 'Story' }) },
    { id: 'advisor', label: t('tab.advisor', { defaultValue: 'Advisor' }) },
  ];

  const exportLabel: Record<ExportFormat, string> = {
    native: t('export.native', { defaultValue: 'RMHCharacters JSON' }),
    foundry: t('export.foundry', { defaultValue: 'Foundry VTT actor JSON' }),
    pathbuilder: t('export.pathbuilder', { defaultValue: 'Pathbuilder 2e JSON' }),
    markdown: t('export.markdown', { defaultValue: 'Markdown sheet' }),
  };

  async function doExport(format: ExportFormat) {
    try {
      const f = await exportCharacter(character, format);
      downloadText(f.filename, f.mime, f.body);
      setExporting(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col gap-3 border-b border-app-border pb-3">
        <div className="rmhc-noprint flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft aria-hidden /> {t('editor.back', { defaultValue: 'All characters' })}
          </Button>
          <span className="flex-1" />
          <SaveState id={character.id} />
          {onLevelUp ? (
            <Button type="button" variant="primary" onClick={onLevelUp}>
              <Sparkles aria-hidden /> {t('editor.levelUp', { defaultValue: 'Level up' })}
            </Button>
          ) : null}
          <Button type="button" onClick={() => setExporting(true)}>
            <Download aria-hidden /> {t('editor.export', { defaultValue: 'Export' })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onTab('sheet');
              setTimeout(() => window.print(), 50);
            }}
          >
            <Printer aria-hidden /> {t('editor.print', { defaultValue: 'Print or PDF' })}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              value={character.name}
              onChange={(e) => {
                const name = e.target.value.slice(0, 120);
                update(character.id, (c) => ({ ...c, name }));
              }}
              placeholder={t('editor.namePlaceholder', { defaultValue: 'Character name' })}
              aria-label={t('editor.name', { defaultValue: 'Character name' })}
              className="text-lg font-semibold"
            />
            <p className="text-sm text-app-text-muted">
              {subtitle} · <span className="font-mono text-xs">{SYSTEM_LABEL[character.system]}</span>
            </p>
          </div>
        </div>
        {pending.build + pending.spells > 0 ? (
          <div className="rmhc-noprint flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-app-warning pl-3 text-sm text-app-text" role="status">
            <span>
              <AlertTriangle className="mr-1.5 inline size-4 align-text-bottom text-app-warning" aria-hidden />
              {pending.build
                ? t('editor.pendingBuild', { defaultValue: '{{count}} build choice(s) still to make', count: pending.build })
                : t('editor.pendingSpells', { defaultValue: '{{count}} spell pick(s) still open', count: pending.spells })}
              {pending.build && pending.spells ? ` · ${t('editor.pendingSpells', { defaultValue: '{{count}} spell pick(s) still open', count: pending.spells })}` : ''}
            </span>
            {tab !== (pending.build ? 'build' : 'spells') ? (
              <Button type="button" size="xs" variant="ghost" onClick={() => onTab(pending.build ? 'build' : 'spells')}>
                {t('editor.showPending', { defaultValue: 'Show me' })}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="rmhc-noprint">
          <Tabs tabs={tabs} value={tab} onChange={(id) => onTab(id as EditorTab)} idBase="rmhc" aria-label={t('editor.sections', { defaultValue: 'Character sections' })} />
        </div>
      </header>
      {(Object.keys(panels) as EditorTab[]).map((id) =>
        id === tab ? (
          <div key={id} role="tabpanel" id={`rmhc-panel-${id}`} aria-labelledby={`rmhc-tab-${id}`}>
            {panels[id]}
          </div>
        ) : null,
      )}
      <Dialog open={exporting} onOpenChange={setExporting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('export.title', { defaultValue: 'Export character' })}</DialogTitle>
            <DialogDescription>{t('export.body', { defaultValue: 'Choose a format. RMHCharacters JSON keeps everything; Foundry exports also carry a full copy so they import back losslessly.' })}</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col">
            {(Object.keys(EXPORTS) as ExportFormat[])
              .filter((f) => EXPORTS[f].systems.includes(character.system))
              .map((f) => (
                <li key={f} className="border-b border-app-border py-2 last:border-b-0">
                  <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => void doExport(f)}>
                    <Download aria-hidden /> {exportLabel[f]}
                  </Button>
                </li>
              ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Where this character's last edit is: saved to the account, on its way, or failed (with a retry). */
function SaveState({ id }: { id: string }) {
  const { t } = useTranslation('c-rmhcharacters');
  const state = useRoster((s) => s.sync[id] ?? 'saved');
  const retry = useRoster((s) => s.retry);
  if (state === 'error') {
    return (
      <span role="alert" className="inline-flex items-center gap-2 text-sm text-app-danger">
        <CloudOff className="size-4" aria-hidden />
        {t('editor.saveFailed', { defaultValue: 'Not saved' })}
        <Button type="button" size="sm" onClick={() => retry(id)}>
          {t('app.retry', { defaultValue: 'Try again' })}
        </Button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-app-text-muted" aria-live="polite">
      {state === 'saved' ? <Check className="size-3.5" aria-hidden /> : <Loader2 className="size-3.5" aria-hidden />}
      {state === 'saved' ? t('editor.saved', { defaultValue: 'Saved' }) : t('editor.saving', { defaultValue: 'Saving…' })}
    </span>
  );
}
