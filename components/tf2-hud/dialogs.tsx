/**
 * Small modal flows: ask for a name, confirm a destructive step, place uploads.
 */
'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  extOf,
  maxBytesFor,
  sanitizePath,
  FONT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  SOUND_EXTENSIONS,
} from '@/lib/tf2-hud/project/paths';
import { textFromBytes } from '@/lib/tf2-hud/project/model';
import { isTextPath } from '@/lib/tf2-hud/project/paths';
import { useEditor } from '@/lib/tf2-hud/store';
import { Btn, Modal, TextField } from './ui';

export function PromptDialog({
  open,
  onOpenChange,
  title,
  label,
  initial,
  confirm,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  label: string;
  initial: string;
  confirm: string;
  onSubmit: (value: string) => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const [value, setValue] = useState(initial);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onOpenChange(false);
    onSubmit(v);
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn variant="primary" onClick={submit} disabled={!value.trim()}>
            {confirm}
          </Btn>
        </>
      }
    >
      <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wider text-(--app-text-dim)">
        {label}
        <TextField
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="h-10 text-sm normal-case tracking-normal"
        />
      </label>
    </Modal>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirm,
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('c-tf2-hud');
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Btn variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            {confirm}
          </Btn>
        </>
      }
    >
      <p className="text-sm text-(--app-text-muted)">{description}</p>
    </Modal>
  );
}

/** Where an uploaded file belongs by default in a TF2 HUD. */
export function defaultDestination(name: string): string {
  const ext = extOf(name);
  const safe = name.replace(/\s+/g, '_').toLowerCase();
  if (FONT_EXTENSIONS.has(ext)) return `resource/${safe}`;
  if (SOUND_EXTENSIONS.has(ext)) return `sound/ui/${safe}`;
  if (IMAGE_EXTENSIONS.has(ext) || ext === 'vmt') return `materials/vgui/custom/${safe}`;
  if (ext === 'res') return `resource/ui/${safe}`;
  if (ext === 'txt') return `scripts/${safe}`;
  return `resource/${safe}`;
}

/** Place a batch of picked files at editable destination paths. */
export function UploadDialog({ files, onClose }: { files: File[]; onClose: () => void }) {
  const { t } = useTranslation('c-tf2-hud');
  const [dests, setDests] = useState<string[]>([]);
  const createFile = useEditor((s) => s.createFile);
  const writeBinary = useEditor((s) => s.writeBinary);
  const writeText = useEditor((s) => s.writeText);
  const open = files.length > 0;

  useEffect(() => {
    setDests(files.map((f) => defaultDestination(f.name)));
  }, [files]);

  const submit = async () => {
    let added = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = sanitizePath(dests[i] ?? '');
      if (!path) {
        toast.error(t('bad-path', { defaultValue: 'Invalid path: {{path}}', path: dests[i] }));
        continue;
      }
      if (f.size > maxBytesFor(path)) {
        toast.error(
          t('too-big-for-type', {
            defaultValue: '{{name}} is larger than {{mb}} MB, the limit for that file type',
            name: f.name,
            mb: Math.round(maxBytesFor(path) / 1024 / 1024),
          }),
        );
        continue;
      }
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (isTextPath(path)) {
        const content = textFromBytes(bytes);
        if (content.kind === 'text') {
          createFile(path, '');
          writeText(path, content.text);
        }
      } else {
        writeBinary(path, bytes);
      }
      added++;
    }
    if (added)
      toast.success(t('uploaded', { defaultValue: '{{count}} file(s) added', count: added }));
    onClose();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('add-files', { defaultValue: 'Add files' })}
      description={t('add-files-hint', {
        defaultValue: 'Choose where each file goes inside the HUD folder.',
      })}
      wide
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            {t('cancel', { defaultValue: 'Cancel' })}
          </Btn>
          <Btn variant="primary" onClick={() => void submit()}>
            {t('add', { defaultValue: 'Add' })}
          </Btn>
        </>
      }
    >
      <ul className="space-y-2">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex flex-col gap-1">
            <span className="truncate text-xs text-(--app-text-muted)">
              {f.name} · {(f.size / 1024).toFixed(1)} KB
            </span>
            <TextField
              aria-label={t('destination', {
                defaultValue: 'Destination for {{name}}',
                name: f.name,
              })}
              value={dests[i] ?? ''}
              onChange={(e) => setDests((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
              className="font-mono"
            />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
