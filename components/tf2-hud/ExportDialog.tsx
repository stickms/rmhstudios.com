/**
 * Download the HUD as a zip that drops straight into tf/custom.
 */
'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { BLOCKS_FILE } from '@/lib/tf2-hud/blocks/types';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { changedFiles } from '@/lib/tf2-hud/project/model';
import { useEditor } from '@/lib/tf2-hud/store';
import { slugify, type ExportScope } from '@/lib/tf2-hud/zip/export';
import { Btn, Modal, Toggle } from './ui';

export default function ExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const meta = useEditor((s) => s.meta);
  const overlay = useEditor((s) => s.overlay);
  const baseIndex = useEditor((s) => s.baseIndex);
  const exportBlob = useEditor((s) => s.exportBlob);
  const [scope, setScope] = useState<ExportScope>('full');
  const [info, setInfo] = useState(true);
  const hasBlocks = useEditor((s) => s.overlay.has(BLOCKS_FILE));
  const [editorData, setEditorData] = useState(false);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);

  const changed = changedFiles(overlay, baseIndex).length;
  const folder = slugify(meta.name);

  const run = async () => {
    setBusy({ done: 0, total: 1 });
    try {
      const blob = await exportBlob(scope, {
        includeInfoVdf: info,
        includeEditorData: editorData,
        onProgress: (done, total) => setBusy({ done, total }),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success(t('downloaded', { defaultValue: 'Downloaded {{name}}.zip', name: folder }));
      onOpenChange(false);
    } catch {
      toast.error(
        t('export-failed', {
          defaultValue: 'Could not build the zip. Check your connection and try again.',
        }),
      );
    } finally {
      setBusy(null);
    }
  };

  const options: { id: ExportScope; title: string; body: string }[] = [
    {
      id: 'full',
      title: t('scope-full', { defaultValue: 'Complete HUD' }),
      body: t('scope-full-body', {
        defaultValue: 'Every file, ready to drop into tf/custom. Recommended.',
      }),
    },
    {
      id: 'changed',
      title: t('scope-changed', { defaultValue: 'Changed files only ({{n}})', n: changed }),
      body: t('scope-changed-body', {
        defaultValue:
          'Just what differs from the TF2 Default HUD — a small patch to layer over another HUD.',
      }),
    },
  ];

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={t('download-hud', { defaultValue: 'Download HUD' })}
      description={t('download-hud-hint', {
        defaultValue: 'Extract the folder into Team Fortress 2/tf/custom/.',
      })}
      footer={
        <>
          <Btn variant="ghost" disabled={!!busy} onClick={() => onOpenChange(false)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn
            variant="primary"
            icon={Download}
            disabled={!!busy || (scope === 'changed' && changed === 0)}
            onClick={() => void run()}
          >
            {busy
              ? t('building', { defaultValue: 'Building…' })
              : t('download-zip', { defaultValue: 'Download zip' })}
          </Btn>
        </>
      }
    >
      <fieldset className="space-y-2" disabled={!!busy}>
        <legend className="sr-only">
          {t('what-to-include', { defaultValue: 'What to include' })}
        </legend>
        {options.map((o) => (
          // The label text is two nested spans (title + description) built from data.
          // eslint-disable-next-line jsx-a11y/label-has-associated-control
          <label
            key={o.id}
            htmlFor={`tf2hud-scope-${o.id}`}
            className={`flex cursor-pointer items-start gap-3 rounded-(--app-radius-sm) border p-3 ${
              scope === o.id
                ? 'border-(--app-accent) bg-(--app-accent-dim)'
                : 'border-(--app-border-bright)'
            }`}
          >
            <input
              id={`tf2hud-scope-${o.id}`}
              type="radio"
              name="scope"
              checked={scope === o.id}
              onChange={() => setScope(o.id)}
              className="mt-1 accent-(--app-accent)"
            />
            <span>
              <span className="block text-sm font-semibold text-(--app-text)">{o.title}</span>
              <span className="block text-xs text-(--app-text-muted)">{o.body}</span>
            </span>
          </label>
        ))}
        <div className="flex items-center justify-between gap-3 pt-2 text-sm text-(--app-text)">
          {t('include-info', { defaultValue: 'Include info.vdf' })}
          <Toggle
            label={t('include-info', { defaultValue: 'Include info.vdf' })}
            checked={info}
            onChange={setInfo}
          />
        </div>
        {hasBlocks ? (
          <div className="flex items-center justify-between gap-3 text-sm text-(--app-text)">
            <span>
              {t('include-blocks', { defaultValue: 'Include block data' })}
              <span className="block text-xs text-(--app-text-muted)">
                {t('include-blocks-hint', {
                  defaultValue:
                    'Lets this editor restore your blocks when the zip is imported. The game ignores it.',
                })}
              </span>
            </span>
            <Toggle
              label={t('include-blocks', { defaultValue: 'Include block data' })}
              checked={editorData}
              onChange={setEditorData}
            />
          </div>
        ) : null}
      </fieldset>
      <p className="mt-3 rounded-(--app-radius-sm) bg-(--app-bg) p-2 font-mono text-[11px] text-(--app-text-dim)">
        {folder}.zip → {folder}/resource, {folder}/scripts, {folder}/materials, {folder}/sound,
        LICENSE
      </p>
      {busy ? (
        <div
          className="mt-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={busy.total}
          aria-valuenow={busy.done}
        >
          <div className="h-1.5 overflow-hidden rounded-full bg-(--app-bg)">
            <div
              className="h-full bg-(--app-accent)"
              style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }}
            />
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-(--app-text-dim)">
        {t('license-note', {
          defaultValue:
            'Downloads include the LICENSE that comes with the TF2 Default base HUD; see it for the terms that apply.',
        })}
      </p>
    </Modal>
  );
}
