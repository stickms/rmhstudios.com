/** The roster: every character in this browser, new / import / export-all. */
import { useState } from 'react';
import { Copy, Download, FileUp, Plus, Trash2, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { rosterBundle } from '@features/rmhcharacters/engine/formats';
import { SYSTEM_LABEL } from '@features/rmhcharacters/engine/data';
import { useRoster } from '@features/rmhcharacters/engine/store';
import type { Character, GameSystem } from '@features/rmhcharacters/engine/types';
import { ImportDialog } from './ImportDialog';
import { downloadText } from './useData';

function summary(c: Character): string {
  if (c.system === 'dnd5e') {
    const level = c.classes.reduce((n, k) => n + k.level, 0);
    const classes = c.classes.map((k) => `${k.classId} ${k.level}`).join(' / ');
    return level ? `Level ${level} · ${classes}` : '';
  }
  return c.classId ? `Level ${c.level} · ${c.ancestryId} ${c.classId}` : '';
}

export function Roster({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation('c-rmhcharacters');
  const characters = useRoster((s) => s.characters);
  const create = useRoster((s) => s.create);
  const duplicate = useRoster((s) => s.duplicate);
  const remove = useRoster((s) => s.remove);
  const confirm = useConfirm();
  const [importing, setImporting] = useState(false);

  const start = (system: GameSystem) => onOpen(create(system).id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-app-border pb-4">
        <h1 className="text-2xl font-semibold text-app-text">{t('title', { defaultValue: 'RMHCharacters' })}</h1>
        <p className="max-w-2xl text-sm text-app-text-muted">
          {t('intro', {
            defaultValue:
              'Build and run characters for D&D 5e (2024 rules) and Pathfinder 2e (Remaster). Every number is computed from the rules, the advisor answers questions about your build, and characters move in and out as Foundry VTT, Pathbuilder, D&D Beyond or Markdown.',
          })}
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" variant="primary" onClick={() => start('dnd5e')}>
            <Plus aria-hidden /> {t('roster.new5e', { defaultValue: 'New D&D 5e character' })}
          </Button>
          <Button type="button" onClick={() => start('pf2e')}>
            <Plus aria-hidden /> {t('roster.newPf2e', { defaultValue: 'New Pathfinder 2e character' })}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setImporting(true)}>
            <FileUp aria-hidden /> {t('roster.import', { defaultValue: 'Import' })}
          </Button>
          {characters.length ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const f = rosterBundle(characters);
                downloadText(f.filename, f.mime, f.body);
              }}
            >
              <Download aria-hidden /> {t('roster.exportAll', { defaultValue: 'Export all' })}
            </Button>
          ) : null}
        </div>
      </header>

      {characters.length === 0 ? (
        <div className="flex flex-col items-start gap-2 py-8">
          <p className="text-base font-medium text-app-text">{t('roster.emptyTitle', { defaultValue: 'No characters yet' })}</p>
          <p className="text-sm text-app-text-muted">
            {t('roster.empty', { defaultValue: 'Start one above, or import a file from another tool. Characters are saved in this browser; export them to keep a copy.' })}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {characters.map((c) => (
            <li key={c.id} className="flex items-center gap-3 border-b border-app-border py-3">
              <button type="button" onClick={() => onOpen(c.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-app-sm text-left hover:bg-app-surface-hover">
                {c.portrait ? (
                  <img src={c.portrait} alt="" className="size-12 shrink-0 rounded-app-sm border border-app-border object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-app-sm border border-app-border bg-app-bg-subtle">
                    <UserRound className="size-5 text-app-text-muted" aria-hidden />
                  </span>
                )}
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-medium text-app-text">{c.name || t('roster.unnamed', { defaultValue: 'Unnamed character' })}</span>
                  <span className="truncate text-sm capitalize text-app-text-muted">{summary(c)}</span>
                  <span className="font-mono text-xs text-app-text-muted">{SYSTEM_LABEL[c.system]}</span>
                </span>
              </button>
              <Button type="button" variant="ghost" size="icon" aria-label={t('roster.duplicate', { defaultValue: 'Duplicate {{name}}', name: c.name || '' })} onClick={() => duplicate(c.id)}>
                <Copy aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('roster.delete', { defaultValue: 'Delete {{name}}', name: c.name || '' })}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('roster.deleteTitle', { defaultValue: 'Delete this character?' }),
                    description: t('roster.deleteBody', { defaultValue: 'It is removed from this browser. Export it first if you want a copy.' }),
                    confirmLabel: t('roster.deleteConfirm', { defaultValue: 'Delete' }),
                    danger: true,
                  });
                  if (ok) remove(c.id);
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={(list) => {
          if (list.length === 1 && list[0]) onOpen(list[0].id);
        }}
      />
    </div>
  );
}
