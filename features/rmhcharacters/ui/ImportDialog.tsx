/**
 * Import: drop or choose a file, or paste JSON. Recognises RMHCharacters,
 * Foundry VTT (dnd5e / pf2e), Pathbuilder 2e and D&D Beyond JSON by shape.
 */
import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/shared/app-toast';
import { dedupeIds, ImportError, importText } from '@features/rmhcharacters/engine/formats';
import { useRoster } from '@features/rmhcharacters/engine/store';
import type { Character } from '@features/rmhcharacters/engine/types';

const MAX_BYTES = 8 * 1024 * 1024;

export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (list: Character[]) => void;
}) {
  const { t } = useTranslation('c-rmhcharacters');
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(text: string) {
    setBusy(true);
    setError('');
    try {
      const result = await importText(text);
      const list = dedupeIds(result.characters, useRoster.getState().characters);
      useRoster.getState().add(list);
      toast.success(
        t('import.done', {
          defaultValue: 'Imported {{count}} character(s) from {{source}}.',
          count: list.length,
          source: result.source,
        }),
      );
      setPaste('');
      onImported(list);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ImportError ? err.message : t('import.failed', { defaultValue: 'That file could not be read.' }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(t('import.tooBig', { defaultValue: 'That file is larger than 8 MB.' }));
      return;
    }
    await run(await file.text());
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    void readFile(e.dataTransfer.files[0]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('import.title', { defaultValue: 'Import characters' })}</DialogTitle>
          <DialogDescription>
            {t('import.formats', {
              defaultValue: 'Reads RMHCharacters, Foundry VTT (dnd5e and pf2e), Pathbuilder 2e and D&D Beyond JSON.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div
          className="rmhc-drop flex flex-col items-center gap-2 rounded-app border border-dashed border-app-border p-6 text-center"
          data-over={over}
          role="region"
          aria-label={t('import.dropZone', { defaultValue: 'File drop area' })}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <Upload className="size-6 text-app-text-muted" aria-hidden />
          <p className="text-sm text-app-text-muted">{t('import.drop', { defaultValue: 'Drop a file here, or' })}</p>
          <Button type="button" onClick={() => input.current?.click()} disabled={busy}>
            {t('import.choose', { defaultValue: 'Choose file' })}
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <Textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder={t('import.paste', { defaultValue: 'Or paste JSON here' })}
          aria-label={t('import.paste', { defaultValue: 'Or paste JSON here' })}
        />
        {error ? (
          <p role="alert" className="text-sm text-app-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button type="button" variant="primary" disabled={busy || !paste.trim()} onClick={() => void run(paste)}>
            {t('import.pasteAction', { defaultValue: 'Import pasted JSON' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
