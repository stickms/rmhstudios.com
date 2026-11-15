/**
 * RmhosApp: starts the machine inside the Screen, shows the boot screen until the desktop is
 * ready, and the toolbar (save, restart, fullscreen, backup, about) over it. The machine, the
 * identity handshake and the home-folder sync live in useRmhosSession.tsx and
 * ../engine/home-session.ts. Client only (the route wraps it in ClientOnly): v86 and the canvas
 * have no server render.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readString, writeString } from '@/lib/core/persist';
import { toast } from '@/lib/shared/app-toast';
import { Button } from '@/components/ui/button';
import { BackupError, checkBackup } from '../engine/home-sync';
import AboutDialog from './AboutDialog';
import { backupBytes } from './backup';
import BootScreen from './BootScreen';
import ConfirmBox from './ConfirmBox';
import { BACKUP_FILE, DAMAGED_FILE, downloadBytes, LAST_SAVED_FILE } from './download';
import Notices from './Notices';
import { reportSave } from './save-messages';
import Screen from './Screen';
import Toolbar from './Toolbar';
import { toolbarState, type NetState } from './toolbar-state';
import { RmhosSessionProvider, useRmhosMachine } from './useRmhosSession';

/** Backups are read into memory whole: refuse anything this big before reading. */
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
const NOTICE_KEY = 'rmhos:files-notice-dismissed';

function isPhone(): boolean {
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 768;
}

export default function RmhosApp() {
  const { t } = useTranslation('c-rmhos');
  const hintId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(() => !isPhone());
  const session = useRmhosMachine(screenRef, confirmed);

  // Dialogs portal into the app root, which carries the --app-* tokens.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(rootRef.current?.closest<HTMLElement>('.app-theme') ?? null), []);

  const [about, setAbout] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  /** The last saved copy offered for download after the current files could not be saved. */
  const [staleOffer, setStaleOffer] = useState<{ bytes: Uint8Array; savedAt: number } | null>(
    null,
  );
  /** The guest screen has focus: keys go to it. */
  const [captured, setCaptured] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  // Fullscreen is the whole app (toolbar, screen, dialogs, toasts, boot screens), not just the
  // screen: everything that must be shown lives inside the element that is fullscreen.
  useEffect(() => {
    setFullscreenAvailable(!!document.fullscreenEnabled);
    const onChange = () => setFullscreen(!!container && document.fullscreenElement === container);
    onChange();
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [container]);

  // The one-time "where the files are" notice, once the desktop is up.
  useEffect(() => {
    if (session.desktopReady && readString(NOTICE_KEY) !== '1') setNoticeOpen(true);
  }, [session.desktopReady]);

  // A failed save is said out loud once per attempt, in plain words (never the internal code); the
  // toolbar keeps saying it, and Notices carries the ones that have an action.
  const shownSave = useRef(0);
  useEffect(() => {
    const last = session.lastSave;
    if (!last || last.at === shownSave.current) return;
    shownSave.current = last.at;
    const report = reportSave(last.result);
    if (report.kind !== 'toast') return;
    toast.error(
      report.key === 'storage-full'
        ? t('save-storage-full', { defaultValue: 'Browser storage is full. Changes are not saved.' })
        : t('save-not-saved', {
            defaultValue: 'Could not save. Your stored files are unchanged.',
          }),
    );
  }, [session.lastSave, t]);

  const net: NetState = !session.net || !session.net.enabled ? 'off' : session.netState;
  const state = toolbarState({
    phase: session.phase === 'session' ? 'booting' : session.phase,
    desktopReady: session.desktopReady,
    lastSave: session.lastSave?.result ?? null,
    saving: session.saving,
    dirty: session.dirty,
    net,
  });

  const fail = useCallback((msg: string) => {
    toast.error(msg);
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const r = await backupBytes(session);
      if (r.kind === 'current') downloadBytes(BACKUP_FILE, r.bytes);
      else if (r.kind === 'stale') setStaleOffer({ bytes: r.bytes, savedAt: r.savedAt });
      else fail(t('backup-failed', { defaultValue: 'Could not create the backup.' }));
    } catch {
      fail(t('backup-failed', { defaultValue: 'Could not create the backup.' }));
    } finally {
      setBusy(false);
    }
  };

  const pickBackup = async (file: File) => {
    const invalid = t('backup-invalid', { defaultValue: 'That file is not an rmhOS backup.' });
    if (file.size > MAX_BACKUP_BYTES) return fail(invalid);
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await checkBackup(bytes); // nothing is written until the person confirms
      setPendingBackup(bytes);
    } catch {
      fail(invalid);
    } finally {
      setBusy(false);
    }
  };

  const replaceWithBackup = async () => {
    const bytes = pendingBackup;
    setPendingBackup(null);
    if (!bytes) return;
    // Save, Download and Restore stay off from the confirm until the new machine is starting.
    setBusy(true);
    try {
      await session.importArchive(bytes);
    } catch (e) {
      setBusy(false);
      const code = e instanceof BackupError ? e.code : 'storage_error';
      return fail(
        code === 'invalid'
          ? t('backup-invalid', { defaultValue: 'That file is not an rmhOS backup.' })
          : code === 'storage-full'
            ? t('save-storage-full', {
                defaultValue: 'Browser storage is full. Changes are not saved.',
              })
            : t('backup-not-stored', {
                defaultValue: 'Could not store the backup. Your files are unchanged.',
              }),
      );
    }
    // No save on the way out: it would replace the backup with the current home.
    try {
      await session.restart({ save: false });
    } finally {
      setBusy(false);
    }
  };

  const putPreviousBack = async () => {
    try {
      await session.putPreviousBack();
    } catch {
      return fail(
        t('backup-not-stored', { defaultValue: 'Could not store the backup. Your files are unchanged.' }),
      );
    }
    await session.restart({ save: false });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void container?.requestFullscreen?.().catch(() => {});
  };

  const dismissNotice = () => {
    writeString(NOTICE_KEY, '1');
    setNoticeOpen(false);
  };

  return (
    <RmhosSessionProvider value={session}>
      <div className="rmhos-root" ref={rootRef}>
        <Toolbar
          state={state}
          storeKind={session.storeKind}
          busy={busy}
          ready={session.desktopReady}
          captured={captured}
          fullscreen={fullscreen}
          fullscreenAvailable={fullscreenAvailable}
          fileInputRef={fileInputRef}
          onSave={() => void session.saveNow()}
          onRestart={() => setConfirmRestart(true)}
          onFullscreen={toggleFullscreen}
          onAbout={() => setAbout(true)}
          onDownload={() => void download()}
          onPickBackup={(f) => void pickBackup(f)}
        />
        {noticeOpen && (
          <div className="rmhos-notices flex items-center justify-between gap-2" role="note">
            <p className="text-xs text-(--app-text-muted)">
              {t('files-kept', { defaultValue: 'Files are kept in this browser on this device.' })}
            </p>
            <Button size="xs" variant="ghost" onClick={dismissNotice}>
              {t('dismiss', { defaultValue: 'Dismiss' })}
            </Button>
          </div>
        )}
        <Notices session={session} busy={busy} onDownload={() => void download()} />
        <div className="rmhos-stage">
          <Screen
            ref={screenRef}
            label={t('screen-label', { defaultValue: 'rmhOS desktop' })}
            hint={t('screen-hint', {
              defaultValue:
                'Keys go to rmhOS while this screen has focus. Press Ctrl+Alt+Shift+Escape to use the page again.',
            })}
            hintId={hintId}
            onCapture={(on) => {
              setCaptured(on);
              session.setKeyboardCapture(on);
              // Whatever was held mid-chord goes up with the focus.
              if (!on) session.releaseModifiers();
            }}
            onRelease={() => {
              // Hand the keyboard back to the page: the first control of the toolbar.
              rootRef.current?.querySelector<HTMLElement>('.rmhos-toolbar button:enabled')?.focus();
            }}
            onInput={session.markDirty}
          />
          {session.phase !== 'running' && (
            <BootScreen
              phase={session.phase}
              detail={session.detail}
              failure={session.failure}
              needsKeyboardNotice={!confirmed}
              onStart={() => setConfirmed(true)}
              onRetry={() => void session.restart()}
              onDownloadDamaged={async () => {
                const raw = await session.exportArchive();
                if (raw) downloadBytes(DAMAGED_FILE, raw);
              }}
              onStartEmpty={async () => {
                await session.startEmpty();
                await session.restart({ save: false });
              }}
              onRestoreBackup={() => fileInputRef.current?.click()}
              previousAvailable={session.previousAvailable}
              onPutPreviousBack={putPreviousBack}
            />
          )}
        </div>
        <AboutDialog open={about} onOpenChange={setAbout} container={container} />
        <ConfirmBox
          open={staleOffer !== null}
          container={container}
          title={t('stale-confirm', {
            defaultValue:
              'The current files could not be saved. Download the last saved copy from {{time}} instead?',
            time: staleOffer ? new Date(staleOffer.savedAt).toLocaleString() : '',
          })}
          confirmLabel={t('download', { defaultValue: 'Download' })}
          onCancel={() => setStaleOffer(null)}
          onConfirm={() => {
            if (staleOffer) downloadBytes(LAST_SAVED_FILE, staleOffer.bytes);
            setStaleOffer(null);
          }}
        />
        <ConfirmBox
          open={confirmRestart}
          container={container}
          title={t('restart-confirm', { defaultValue: 'Restart rmhOS? Unsaved changes are lost.' })}
          confirmLabel={t('restart', { defaultValue: 'Restart' })}
          onCancel={() => setConfirmRestart(false)}
          onConfirm={() => {
            setConfirmRestart(false);
            void session.restart({ save: false });
          }}
        />
        <ConfirmBox
          open={pendingBackup !== null}
          container={container}
          title={t('restore-confirm', {
            defaultValue: 'Replace your files with this backup? The current files are lost.',
          })}
          confirmLabel={t('replace', { defaultValue: 'Replace' })}
          onCancel={() => setPendingBackup(null)}
          onConfirm={() => void replaceWithBackup()}
        />
      </div>
    </RmhosSessionProvider>
  );
}
