/**
 * Assets — fonts, sounds and textures in the HUD: upload, preview, replace,
 * remove, and register fonts in the scheme so panels can use them.
 */
'use client';

import { Download, Play, Trash2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { readFontNames } from '@/lib/tf2-hud/assets/ttf-names';
import { decodeVtf } from '@/lib/tf2-hud/assets/vtf';
import { categoryOf, basename, extOf } from '@/lib/tf2-hud/project/paths';
import { registerFontInScheme } from '@/lib/tf2-hud/scheme/register-font';
import { useEditor } from '@/lib/tf2-hud/store';
import { UploadDialog } from './dialogs';
import { Btn, EmptyNote, IconBtn, Modal, NumberField, PanelHead, Pill, TextField } from './ui';

type Kind = 'fonts' | 'sounds' | 'textures';

const SOUND_SUGGESTIONS = [
  'sound/ui/hitsound.wav',
  'sound/ui/killsound.wav',
  'sound/ui/buttonclick.wav',
  'sound/ui/buttonrollover.wav',
] as const;

function kindOf(path: string): Kind | null {
  const c = categoryOf(path);
  if (c === 'font') return 'fonts';
  if (c === 'sound') return 'sounds';
  if (c === 'image' && extOf(path) !== 'vmt') return 'textures';
  return null;
}

function Thumb({ path }: { path: string }) {
  const readBytes = useEditor((s) => s.readBytes);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    const bytes = readBytes(path);
    if (!bytes) return;
    let url: string | undefined;
    if (extOf(path) === 'vtf') {
      const img = decodeVtf(bytes);
      if (img) {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')?.putImageData(
          new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height),
          0,
          0,
        );
        setSrc(c.toDataURL());
      }
    } else {
      url = URL.createObjectURL(new Blob([bytes as BlobPart]));
      setSrc(url);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, readBytes]);
  return (
    <span className="tf2hud-checker relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-(--app-radius-sm) border border-(--app-border)">
      {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : null}
    </span>
  );
}

function SoundPlayer({ path }: { path: string }) {
  const { t } = useTranslation('c-tf2-hud');
  const readBytes = useEditor((s) => s.readBytes);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  return (
    <IconBtn
      icon={Play}
      active={playing}
      label={t('play', { defaultValue: 'Play {{name}}', name: basename(path) })}
      onClick={() => {
        const bytes = readBytes(path);
        if (!bytes) return;
        audio.current?.pause();
        const url = URL.createObjectURL(
          new Blob([bytes as BlobPart], {
            type:
              extOf(path) === 'mp3'
                ? 'audio/mpeg'
                : extOf(path) === 'ogg'
                  ? 'audio/ogg'
                  : 'audio/wav',
          }),
        );
        const a = new Audio(url);
        audio.current = a;
        setPlaying(true);
        a.onended = a.onerror = () => {
          setPlaying(false);
          URL.revokeObjectURL(url);
        };
        void a.play().catch(() => setPlaying(false));
      }}
    />
  );
}

export default function AssetsPanel() {
  const { t } = useTranslation('c-tf2-hud');
  const overlay = useEditor((s) => s.overlay);
  const baseIndex = useEditor((s) => s.baseIndex);
  const tfAssets = useEditor((s) => s.tfAssets);
  const readBytes = useEditor((s) => s.readBytes);
  const readText = useEditor((s) => s.readText);
  const writeText = useEditor((s) => s.writeText);
  const deletePath = useEditor((s) => s.deletePath);
  const writeBinary = useEditor((s) => s.writeBinary);
  const [kind, setKind] = useState<Kind>('fonts');
  const [uploads, setUploads] = useState<File[]>([]);
  const [regFor, setRegFor] = useState<string | null>(null);
  const [reg, setReg] = useState({ schemeName: '', face: '', tall: 16, weight: 400 });
  const input = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  const files = useMemo(() => {
    const set = new Set<string>(baseIndex ? baseIndex.files.keys() : []);
    for (const [p, c] of overlay) {
      if (c === null) set.delete(p);
      else set.add(p);
    }
    for (const p of tfAssets.keys()) set.add(p);
    return [...set].filter((p) => kindOf(p) === kind).sort();
  }, [overlay, baseIndex, tfAssets, kind]);

  const tabs: LiquidTab[] = [
    { id: 'fonts', label: t('fonts', { defaultValue: 'Fonts' }) },
    { id: 'sounds', label: t('sounds', { defaultValue: 'Sounds' }) },
    { id: 'textures', label: t('textures', { defaultValue: 'Textures' }) },
  ];
  const accept =
    kind === 'fonts'
      ? '.ttf,.otf'
      : kind === 'sounds'
        ? '.wav,.mp3,.ogg'
        : '.png,.jpg,.jpeg,.vtf,.vmt';

  const openRegister = (path: string) => {
    const names = readFontNames(readBytes(path) ?? new Uint8Array());
    const face = names[0] ?? basename(path).replace(/\.\w+$/, '');
    setReg({ schemeName: face.replace(/\s+/g, ''), face, tall: 16, weight: 400 });
    setRegFor(path);
  };

  const doRegister = () => {
    const text = readText('resource/clientscheme.res');
    if (!regFor || text === undefined) return;
    writeText('resource/clientscheme.res', registerFontInScheme(text, { file: regFor, ...reg }));
    toast.success(
      t('font-registered', {
        defaultValue: '"{{name}}" added to clientscheme.res',
        name: reg.schemeName,
      }),
    );
    setRegFor(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead
        title={t('assets', { defaultValue: 'Assets' })}
        actions={
          <Btn size="xs" icon={Upload} onClick={() => input.current?.click()}>
            {t('upload', { defaultValue: 'Upload' })}
          </Btn>
        }
      />
      <div className="border-b border-(--app-border) p-2">
        <LiquidTabs
          tabs={tabs}
          value={kind}
          size="sm"
          onChange={(id) => setKind(id as Kind)}
          aria-label={t('asset-type', { defaultValue: 'Asset type' })}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {kind === 'sounds' ? (
          <p className="px-3 pt-2 text-[11px] text-(--app-text-dim)">
            {t('sound-hint', {
              defaultValue: 'Replace a default sound by uploading a file to the same path, e.g.',
            })}{' '}
            <span className="font-mono">{SOUND_SUGGESTIONS.join(', ')}</span>
          </p>
        ) : null}
        {files.length === 0 ? (
          <EmptyNote>
            {t('no-assets', {
              defaultValue: 'Nothing here yet. Upload a file or drop one onto the file tree.',
            })}
          </EmptyNote>
        ) : (
          <ul>
            {files.map((p) => {
              const inProject = overlay.get(p) != null;
              const names = kind === 'fonts' ? readFontNames(readBytes(p) ?? new Uint8Array()) : [];
              return (
                <li
                  key={p}
                  className="flex items-center gap-2 border-b border-(--app-border) px-3 py-2"
                >
                  {kind === 'textures' ? <Thumb path={p} /> : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs text-(--app-text)">{p}</p>
                    <p className="flex flex-wrap items-center gap-1 text-[11px] text-(--app-text-dim)">
                      {inProject ? (
                        <Pill tone="accent">{t('in-hud', { defaultValue: 'in HUD' })}</Pill>
                      ) : (
                        <Pill>{t('from-game', { defaultValue: 'from game files' })}</Pill>
                      )}
                      {names.map((n) => (
                        <span
                          key={n}
                          style={{ fontFamily: `"${n}"` }}
                          className="text-(--app-text-muted)"
                        >
                          {n}
                        </span>
                      ))}
                    </p>
                  </div>
                  {kind === 'sounds' ? <SoundPlayer path={p} /> : null}
                  {kind === 'fonts' ? (
                    <Btn size="xs" variant="ghost" onClick={() => openRegister(p)}>
                      {t('register', { defaultValue: 'Register' })}
                    </Btn>
                  ) : null}
                  <IconBtn
                    icon={Download}
                    size="xs"
                    label={t('download-file', { defaultValue: 'Download file' })}
                    onClick={() => {
                      const b = readBytes(p);
                      if (!b) return;
                      const url = URL.createObjectURL(new Blob([b as BlobPart]));
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = basename(p);
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  />
                  <IconBtn
                    icon={Upload}
                    size="xs"
                    label={t('replace', { defaultValue: 'Replace {{name}}', name: basename(p) })}
                    onClick={() => {
                      replaceTarget.current = p;
                      replaceInput.current?.click();
                    }}
                  />
                  {inProject ? (
                    <IconBtn
                      icon={Trash2}
                      size="xs"
                      label={t('delete', { defaultValue: 'Delete' })}
                      onClick={() => deletePath(p)}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = [...(e.target.files ?? [])];
          if (f.length) setUploads(f);
          e.target.value = '';
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          const target = replaceTarget.current;
          e.target.value = '';
          if (!f || !target) return;
          writeBinary(target, new Uint8Array(await f.arrayBuffer()));
        }}
      />
      <UploadDialog files={uploads} onClose={() => setUploads([])} />
      <Modal
        open={regFor !== null}
        onOpenChange={(o) => !o && setRegFor(null)}
        title={t('register-font', { defaultValue: 'Register font' })}
        description={t('register-font-hint', {
          defaultValue: 'Adds the file to CustomFontFiles and a named font to clientscheme.res.',
        })}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRegFor(null)}>
              {t('cancel', { defaultValue: 'Cancel' })}
            </Btn>
            <Btn variant="primary" onClick={doRegister} disabled={!reg.schemeName.trim()}>
              {t('register', { defaultValue: 'Register' })}
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('scheme-name', { defaultValue: 'Scheme font name (used by panels)' })}
            <TextField
              value={reg.schemeName}
              onChange={(e) => setReg({ ...reg, schemeName: e.target.value.replace(/\s+/g, '') })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
            {t('face-name', { defaultValue: 'Family name inside the file' })}
            <TextField
              value={reg.face}
              onChange={(e) => setReg({ ...reg, face: e.target.value })}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
              {t('size', { defaultValue: 'Size' })}
              <NumberField
                label={t('size', { defaultValue: 'Size' })}
                value={reg.tall}
                min={4}
                max={200}
                onChange={(tall) => setReg({ ...reg, tall })}
                className="w-24"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-(--app-text-muted)">
              {t('weight', { defaultValue: 'Weight' })}
              <NumberField
                label={t('weight', { defaultValue: 'Weight' })}
                value={reg.weight}
                min={0}
                max={1000}
                step={100}
                onChange={(weight) => setReg({ ...reg, weight })}
                className="w-24"
              />
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
