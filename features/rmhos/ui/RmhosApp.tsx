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
import { checkBackup } from '../engine/home-sync';
import { resolveImageManifest } from '../engine/image-manifest';
import { CDN_BASE } from '@/lib/storage/asset';
import ComingSoon from './ComingSoon';
import AboutDialog from './AboutDialog';
import DamagedExistsDialog from './DamagedExistsDialog';
import { backupBytes } from './backup';
import BootScreen from './BootScreen';
import ConfirmBox from './ConfirmBox';
import { BACKUP_FILE, DAMAGED_FILE, downloadBytes, LAST_SAVED_FILE } from './download';
import Notices from './Notices';
import {
  putBackCopy,
  reportRestoreError,
  reportSave,
  restoreFailureCopy,
} from './save-messages';
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

function RmhosMachine() {
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
  const [confirmPutBack, setConfirmPutBack] = useState(false);
  /** An earlier damaged copy blocks the operation: download or remove it first. */
  const [damagedBlock, setDamagedBlock] = useState(false);
  const [confirmRemoveDamaged, setConfirmRemoveDamaged] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<Uint8Array | null>(null);
  /** The backup the person already chose and confirmed, waiting for an earlier damaged copy to go. */
  const [blockedBackup, setBlockedBackup] = useState<Uint8Array | null>(null);
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

  const replaceWithBackup = async (given?: Uint8Array) => {
    const bytes = given ?? pendingBackup;
    setPendingBackup(null);
    if (!bytes) return;
    // Save, Download and Restore stay off from the confirm until the new machine is starting.
    setBusy(true);
    try {
      await session.importArchive(bytes);
    } catch (e) {
      setBusy(false);
      const failure = reportRestoreError(e);
      if (failure === 'damaged-exists') {
        setBlockedBackup(bytes); // carried on once the earlier copy is gone: no second file pick
        return setDamagedBlock(true);
      }
      return fail(restoreFailureCopy(t, failure));
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
    } catch (e) {
      return fail(restoreFailureCopy(t, reportRestoreError(e)));
    }
    await session.restart({ save: false });
  };

  const startEmpty = async () => {
    try {
      await session.startEmpty();
    } catch (e) {
      const failure = reportRestoreError(e);
      if (failure === 'damaged-exists') return setDamagedBlock(true);
      return fail(restoreFailureCopy(t, failure));
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
        {/* Always laid out, so the toolbar and the screen never move when focus changes. */}
        <div className="rmhos-hintbar text-xs text-(--app-text)" aria-hidden={!captured}>
          <span
            className="rmhos-hintbar-text"
            title={t('capture-hint', {
              defaultValue: 'Keys go to rmhOS. Press Ctrl+Alt+Shift+Esc to leave.',
            })}
          >
            {t('capture-hint', {
              defaultValue: 'Keys go to rmhOS. Press Ctrl+Alt+Shift+Esc to leave.',
            })}
          </span>
        </div>
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
              onStartEmpty={startEmpty}
              onRestoreBackup={() => fileInputRef.current?.click()}
              previousAvailable={session.previousAvailable}
              onPutPreviousBack={() => setConfirmPutBack(true)}
            />
          )}
        </div>
        <AboutDialog
          open={about}
          onOpenChange={setAbout}
          container={container}
          session={session}
          currentDamaged={session.failure === 'corrupt'}
          readOnly={session.failure === 'locked'}
        />
        <ConfirmBox
          open={confirmPutBack}
          container={container}
          title={putBackCopy(t, session.previousSavedAt ?? 0)}
          confirmLabel={t('put-back', { defaultValue: 'Put back' })}
          onCancel={() => setConfirmPutBack(false)}
          onConfirm={() => {
            setConfirmPutBack(false);
            void putPreviousBack();
          }}
        />
        <DamagedExistsDialog
          open={damagedBlock && !confirmRemoveDamaged}
          container={container}
          onClose={() => {
            setDamagedBlock(false);
            setBlockedBackup(null);
          }}
          onDownload={async () => {
            try {
              const raw = await session.exportCopy('damaged');
              if (raw) downloadBytes(DAMAGED_FILE, raw);
              else throw new Error('missing');
            } catch {
              fail(
                t('copy-download-failed', {
                  defaultValue: 'Could not download the copy. Nothing was changed.',
                }),
              );
            }
          }}
          onRemove={() => setConfirmRemoveDamaged(true)}
        />
        <ConfirmBox
          open={confirmRemoveDamaged}
          container={container}
          title={t('remove-damaged-confirm', {
            defaultValue: 'Remove the earlier damaged copy? It cannot be recovered.',
          })}
          confirmLabel={t('remove', { defaultValue: 'Remove' })}
          onCancel={() => setConfirmRemoveDamaged(false)}
          onConfirm={async () => {
            setConfirmRemoveDamaged(false);
            try {
              await session.removeCopy('damaged');
            } catch {
              return fail(
                t('copy-remove-failed', {
                  defaultValue: 'Could not remove the copy. Nothing was changed.',
                }),
              );
            }
            setDamagedBlock(false);
            const again = blockedBackup;
            setBlockedBackup(null);
            if (again) void replaceWithBackup(again);
          }}
        />
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
          title={t('restore-confirm-keeps', {
            defaultValue:
              'Replace your files with this backup? Your current files are kept as one previous copy until you save.',
          })}
          confirmLabel={t('replace', { defaultValue: 'Replace' })}
          onCancel={() => setPendingBackup(null)}
          onConfirm={() => void replaceWithBackup(undefined)}
        />
      </div>
    </RmhosSessionProvider>
  );
}

/**
 * With a CDN base and no published image there is nothing to boot: the panel replaces the whole
 * machine (its hooks never run), so no emulator, session ticket, tab lock or store is touched.
 */
export default function RmhosApp() {
  return resolveImageManifest(CDN_BASE || undefined) === null ? <ComingSoon /> : <RmhosMachine />;
}
