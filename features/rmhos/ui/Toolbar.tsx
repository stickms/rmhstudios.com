/**
 * The controls over the screen: save, restart, fullscreen, backup, about, and the two status
 * words (save, network). What each shows comes from toolbarState() (toolbar-state.ts); this file
 * only maps its logical keys to literal t() calls and draws them.
 */
import {
  Download,
  Info,
  Maximize,
  Minimize,
  RotateCcw,
  Save,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { ChangeEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ToolbarState } from './toolbar-state';

interface Props {
  state: ToolbarState;
  /** 'memory': this browser blocks storage, so the status must not say Saved. */
  storeKind: 'indexeddb' | 'memory';
  busy: boolean;
  /** The desktop is up: only then is a save status true. */
  ready: boolean;
  fullscreen: boolean;
  fullscreenAvailable: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSave: () => void;
  onRestart: () => void;
  onFullscreen: () => void;
  onAbout: () => void;
  onDownload: () => void;
  onPickBackup: (file: File) => void;
}

export default function Toolbar(p: Props) {
  const { t } = useTranslation('c-rmhos');
  const { state } = p;

  const saveText: Record<string, string> = {
    'save.saved': t('status-saved', { defaultValue: 'Saved' }),
    'save.saving': t('save-saving', { defaultValue: 'Saving' }),
    'save.unsaved': t('status-unsaved', { defaultValue: 'Unsaved changes' }),
    'save.storageFull': t('status-storage-full', { defaultValue: 'Browser storage is full' }),
    'save.failed': t('status-failed', { defaultValue: 'Could not save' }),
  };
  const netText: Record<string, string> = {
    'net.off': t('net-off', { defaultValue: 'Network off' }),
    'net.connecting': t('net-connecting', { defaultValue: 'Connecting' }),
    'net.online': t('net-online', { defaultValue: 'Online' }),
    'net.unavailable': t('net-unavailable', { defaultValue: 'Network unavailable' }),
  };
  // Never "Saved" while nothing outlives the page.
  const saveLabel =
    p.storeKind === 'memory' && state.saveLabelKey === 'save.saved'
      ? t('save-memory', { defaultValue: 'Not saved: browser storage is unavailable' })
      : (saveText[state.saveLabelKey] ?? '');
  const netLabel = netText[state.netLabelKey] ?? '';
  const netOn = state.netLabelKey === 'net.online';

  const labels = {
    save: t('save', { defaultValue: 'Save' }),
    restart: t('restart', { defaultValue: 'Restart' }),
    fullscreen: t('fullscreen', { defaultValue: 'Fullscreen' }),
    exitFullscreen: t('exit-fullscreen', { defaultValue: 'Exit fullscreen' }),
    about: t('about', { defaultValue: 'About' }),
    download: t('download-backup', { defaultValue: 'Download backup' }),
    restore: t('restore-backup', { defaultValue: 'Restore backup' }),
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again
    if (f) p.onPickBackup(f);
  };

  return (
    <div
      className="rmhos-toolbar"
      role="group"
      aria-label={t('toolbar-label', { defaultValue: 'rmhOS controls' })}
    >
      <div className="rmhos-toolbar-status">
        <span role="status" className="text-xs font-mono text-(--app-text-muted)">
          {p.ready ? saveLabel : ''}
        </span>
        <span className="text-xs font-mono text-(--app-text-muted) inline-flex items-center gap-1">
          {netOn ? (
            <Wifi className="size-3" aria-hidden="true" />
          ) : (
            <WifiOff className="size-3" aria-hidden="true" />
          )}
          {netLabel}
        </span>
      </div>
      <div className="rmhos-toolbar-actions">
        <Button
          variant="primary"
          size="sm"
          aria-label={labels.save}
          disabled={state.saveDisabled || p.busy}
          onClick={p.onSave}
        >
          <Save aria-hidden="true" />
          <span className="rmhos-toolbar-text">{labels.save}</span>
        </Button>
        {state.showRestart && (
          <Button size="sm" aria-label={labels.restart} onClick={p.onRestart}>
            <RotateCcw aria-hidden="true" />
            <span className="rmhos-toolbar-text">{labels.restart}</span>
          </Button>
        )}
        {p.fullscreenAvailable && (
          <Button
            size="sm"
            aria-label={p.fullscreen ? labels.exitFullscreen : labels.fullscreen}
            onClick={p.onFullscreen}
          >
            {p.fullscreen ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
            <span className="rmhos-toolbar-text">{labels.fullscreen}</span>
          </Button>
        )}
        {state.showBackup && (
          <>
            <Button size="sm" aria-label={labels.download} disabled={p.busy} onClick={p.onDownload}>
              <Download aria-hidden="true" />
              <span className="rmhos-toolbar-text">{labels.download}</span>
            </Button>
            <Button
              size="sm"
              aria-label={labels.restore}
              disabled={p.busy}
              onClick={() => p.fileInputRef.current?.click()}
            >
              <Upload aria-hidden="true" />
              <span className="rmhos-toolbar-text">{labels.restore}</span>
            </Button>
          </>
        )}
        <Button size="sm" aria-label={labels.about} onClick={p.onAbout}>
          <Info aria-hidden="true" />
          <span className="rmhos-toolbar-text">{labels.about}</span>
        </Button>
      </div>
      <input
        ref={p.fileInputRef}
        type="file"
        accept=".gz,.tgz,application/gzip"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
      />
    </div>
  );
}
