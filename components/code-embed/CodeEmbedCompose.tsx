'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Code2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EMBED_FIELD_MAX, EMBED_TOTAL_MAX, type CodeEmbed } from '@/lib/code-embed/shared';

/** Composer state for a runnable snippet (F14): menu item, chip and editor dialog. */
export function useCodeEmbedCompose() {
  const [embed, setEmbed] = useState<CodeEmbed | null>(null);
  const [open, setOpen] = useState(false);
  return {
    embed,
    setEmbed,
    open,
    setOpen,
    bodyFields: embed ? { codeEmbed: embed } : {},
    reset: () => setEmbed(null),
  };
}
export type CodeEmbedCompose = ReturnType<typeof useCodeEmbedCompose>;

export function CodeEmbedMenuItem({ ce, onPick }: { ce: CodeEmbedCompose; onPick: () => void }) {
  const { t } = useTranslation('f-creative');
  return (
    <button
      type="button"
      onClick={() => {
        ce.setOpen(true);
        onPick();
      }}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
    >
      <Code2 className={`w-4 h-4 ${ce.embed ? 'text-site-accent' : 'text-site-text-dim'}`} />
      <span className="flex-1 text-left">
        {t('embed-menu', { defaultValue: 'Runnable code snippet' })}
      </span>
      {ce.embed && <Check className="w-4 h-4 text-site-accent" />}
    </button>
  );
}

export function CodeEmbedChip({ ce }: { ce: CodeEmbedCompose }) {
  const { t } = useTranslation('f-creative');
  if (!ce.embed) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => ce.setEmbed(null)}
        className="inline-flex items-center gap-1 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent transition-colors hover:bg-site-accent/20"
      >
        <Code2 className="h-3.5 w-3.5" aria-hidden />
        <span>{t('embed-chip', { defaultValue: 'Code snippet' })}</span>
        <X className="h-3 w-3" aria-hidden />
        <span className="sr-only">
          {t('embed-chip-remove', { defaultValue: 'Remove snippet' })}
        </span>
      </button>
    </div>
  );
}

export function CodeEmbedDialog({ ce }: { ce: CodeEmbedCompose }) {
  const { t } = useTranslation('f-creative');
  const [draft, setDraft] = useState<CodeEmbed>({ html: '', css: '', js: '' });
  const total = draft.html.length + draft.css.length + draft.js.length;
  const valid = total > 0 && total <= EMBED_TOTAL_MAX;
  const fields: Array<{ key: keyof CodeEmbed; label: string }> = [
    { key: 'html', label: t('embed-html', { defaultValue: 'HTML' }) },
    { key: 'css', label: t('embed-css', { defaultValue: 'CSS' }) },
    { key: 'js', label: t('embed-js', { defaultValue: 'JavaScript' }) },
  ];
  return (
    <Dialog
      open={ce.open}
      onOpenChange={(o) => {
        if (o && ce.embed) setDraft(ce.embed);
        ce.setOpen(o);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('embed-title', { defaultValue: 'Runnable code snippet' })}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-site-text-muted">
          {t('embed-hint', {
            defaultValue:
              'Readers press Run to see it. It runs in a sandbox with no network access and never runs by itself.',
          })}
        </p>
        <div className="space-y-3">
          {fields.map((f) => (
            <label key={f.key} className="block text-xs font-medium text-site-text-muted">
              {f.label}
              <Textarea
                className="glass-inset mt-1 h-24 font-mono text-xs"
                spellCheck={false}
                maxLength={EMBED_FIELD_MAX}
                value={draft[f.key]}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            </label>
          ))}
          <p
            className={`text-xs ${valid || total === 0 ? 'text-site-text-dim' : 'text-site-danger'}`}
          >
            {t('embed-size', {
              defaultValue: '{{used}} of {{max}} characters',
              used: total,
              max: EMBED_TOTAL_MAX,
            })}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => ce.setOpen(false)}>
            {t('embed-cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="accent"
            disabled={!valid}
            onClick={() => {
              ce.setEmbed(draft);
              ce.setOpen(false);
            }}
          >
            {t('embed-attach', { defaultValue: 'Attach' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
