'use client';

/**
 * Create-with-note / edit dialog for a highlight (L1). The note can be private
 * (default) or public; making a highlight public is also what makes it count
 * toward the L8 "N readers highlighted this" figure, which the dialog says.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { passagesFor } from '@/lib/reading/passages';
import type { NewHighlightInput } from '@/lib/reading/client';
import { HIGHLIGHT_NOTE_MAX, type HighlightView } from '@/lib/reading/schema';

export type EditorState =
  | { mode: 'create'; quote: string; anchor: NewHighlightInput }
  | { mode: 'edit'; quote: string; highlight: HighlightView; start: number; end: number };

interface Actions {
  create: (input: NewHighlightInput) => Promise<HighlightView>;
  update: (
    id: string,
    patch: { note?: string | null; isPublic?: boolean; passages?: ReturnType<typeof passagesFor> },
  ) => Promise<HighlightView>;
  remove: (id: string) => Promise<void>;
}

export function HighlightEditor({
  state,
  onClose,
  indexText,
  actions,
  onError,
}: {
  state: EditorState | null;
  onClose: () => void;
  /** The current unit text, for computing L8 passages. */
  indexText: () => string;
  actions: Actions;
  onError: (err: unknown) => void;
}) {
  const { t } = useTranslation('f-reading');
  const [note, setNote] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === 'edit') {
      setNote(state.highlight.note ?? '');
      setIsPublic(state.highlight.isPublic);
    } else {
      setNote('');
      setIsPublic(false);
    }
  }, [state]);

  async function save() {
    if (!state || busy) return;
    setBusy(true);
    try {
      const text = indexText();
      if (state.mode === 'create') {
        await actions.create({
          ...state.anchor,
          note: note.trim() || undefined,
          isPublic,
          passages: isPublic ? passagesFor(text, state.anchor.start, state.anchor.end) : [],
        });
        toast.success(t('note-saved', { defaultValue: 'Saved.' }));
      } else {
        const h = state.highlight;
        await actions.update(h.id, {
          note: note.trim() || null,
          isPublic,
          ...(isPublic && !h.isPublic
            ? { passages: passagesFor(text, state.start, state.end) }
            : {}),
        });
        toast.success(t('note-saved', { defaultValue: 'Saved.' }));
      }
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!state || state.mode !== 'edit' || busy) return;
    setBusy(true);
    try {
      await actions.remove(state.highlight.id);
      toast.success(t('highlight-removed', { defaultValue: 'Highlight removed.' }));
      onClose();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.mode === 'edit'
              ? t('edit-highlight', { defaultValue: 'Edit highlight' })
              : t('new-note', { defaultValue: 'Add a note' })}
          </DialogTitle>
          <DialogDescription>
            {t('editor-description', {
              defaultValue: 'Notes are private unless you make them public.',
            })}
          </DialogDescription>
        </DialogHeader>
        <blockquote className="max-h-32 overflow-y-auto border-s-4 border-site-accent ps-3 text-sm text-site-text-muted">
          {state?.quote}
        </blockquote>
        <div className="space-y-1.5">
          <label htmlFor="rf-note" className="text-sm font-medium text-site-text">
            {t('note-label', { defaultValue: 'Note' })}
          </label>
          <Textarea
            id="rf-note"
            value={note}
            maxLength={HIGHLIGHT_NOTE_MAX}
            rows={4}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('note-placeholder', { defaultValue: 'Your thoughts (optional)' })}
          />
        </div>
        <div className="flex items-start gap-3">
          <Switch
            id="rf-public"
            checked={isPublic}
            onCheckedChange={setIsPublic}
            aria-labelledby="rf-public-label"
            aria-describedby="rf-public-hint"
          />
          <div className="text-sm">
            <p id="rf-public-label" className="font-medium text-site-text">
              {t('make-public', { defaultValue: 'Make public' })}
            </p>
            <p id="rf-public-hint" className="text-site-text-muted">
              {t('make-public-hint', {
                defaultValue:
                  'Others can read your note, and your highlight counts toward “N readers highlighted this”.',
              })}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {state?.mode === 'edit' ? (
            <Button type="button" variant="outline" onClick={remove} disabled={busy}>
              {t('remove-highlight', { defaultValue: 'Remove highlight' })}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="accent" onClick={save} loading={busy}>
            {t('save', { defaultValue: 'Save' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
