/**
 * The Projects menu in the Studio toolbar: the open project's name and saved state, and the menu of everything you
 * can do with a project (New, Open, Save, Save as, Rename, Delete, and for members Save to account / Open from
 * account). The state word is a polite live region so a screen reader hears "Saved" after Ctrl+S.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  CloudDownload,
  CloudOff,
  CloudUpload,
  FilePlus,
  FolderOpen,
  History,
  LogIn,
  Pencil,
  Save,
  SaveAll,
  Trash2,
} from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { ExportMenuItems } from '@/components/studio/ExportMenuItems';
import { ProjectVersionsDialog } from '@/components/studio/ProjectVersionsDialog';
import type { ProjectSession } from '@/components/studio/useProjectSession';

export function ProjectsMenu({ session }: { session: ProjectSession }) {
  const { t } = useTranslation('studio-projects');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const close = () => setOpen(false);
  /** Run a menu action after the menu has closed, so focus returns to the trigger first. */
  const run = (action: () => void | Promise<void>) => () => {
    close();
    void action();
  };

  const stateLabel = {
    saved: t('state-saved', { defaultValue: 'Saved' }),
    unsaved: t('state-unsaved', { defaultValue: 'Unsaved changes' }),
    saving: t('state-saving', { defaultValue: 'Saving…' }),
    error: t('state-error', { defaultValue: 'Not saved' }),
  }[session.saveState];

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 max-w-[9rem] truncate text-xs font-medium text-app-text xl:max-w-[14rem]">
        {session.name}
      </span>
      <span
        role="status"
        aria-live="polite"
        className={`shrink-0 text-xs ${session.saveState === 'error' ? 'text-app-danger' : 'text-app-text-muted'}`}
      >
        {stateLabel}
      </span>

      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-9 shrink-0 items-center gap-1 rounded-app-sm px-2 py-1 text-xs text-app-text-muted hover:bg-app-surface-hover hover:text-app-text pointer-coarse:min-h-11"
      >
        <FolderOpen className="h-3.5 w-3.5" aria-hidden />
        {t('menu-trigger', { defaultValue: 'Projects' })}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>

      <AnchoredMenu
        open={open}
        onClose={close}
        anchorRef={anchorRef}
        label={t('menu-label', { defaultValue: 'Projects' })}
        align="end"
      >
        <MenuItem icon={FilePlus} onSelect={run(session.newProject)}>
          {t('menu-new', { defaultValue: 'New project' })}
        </MenuItem>
        <MenuItem icon={FolderOpen} onSelect={run(() => session.setOpenDialog('device'))}>
          {t('menu-open', { defaultValue: 'Open…' })}
        </MenuItem>
        <MenuItem icon={Save} hint="Ctrl+S" onSelect={run(session.save)}>
          {t('menu-save', { defaultValue: 'Save' })}
        </MenuItem>
        <MenuItem icon={SaveAll} hint="Ctrl+Shift+S" onSelect={run(session.saveAs)}>
          {t('menu-save-as', { defaultValue: 'Save as…' })}
        </MenuItem>
        <MenuItem icon={Pencil} onSelect={run(session.rename)}>
          {t('menu-rename', { defaultValue: 'Rename…' })}
        </MenuItem>
        <MenuItem icon={Trash2} tone="danger" disabled={!session.hasId} onSelect={run(session.deleteCurrent)}>
          {t('menu-delete', { defaultValue: 'Delete…' })}
        </MenuItem>

        <MenuSeparator />

        <ExportMenuItems close={close} />

        <MenuSeparator />

        {session.signedIn ? (
          <>
            <MenuItem icon={CloudUpload} onSelect={run(session.saveToAccount)}>
              {t('menu-save-account', { defaultValue: 'Save to account' })}
            </MenuItem>
            <MenuItem icon={CloudDownload} onSelect={run(() => session.setOpenDialog('account'))}>
              {t('menu-open-account', { defaultValue: 'Open from account' })}
            </MenuItem>
            {session.linked ? (
              <MenuItem icon={History} onSelect={run(() => setVersionsOpen(true))}>
                {t('menu-versions', { ns: 'studio-history', defaultValue: 'Versions…' })}
              </MenuItem>
            ) : null}
            {session.linked ? (
              <MenuItem icon={CloudOff} tone="danger" onSelect={run(session.deleteCurrentFromAccount)}>
                {t('menu-delete-account', { defaultValue: 'Delete from account…' })}
              </MenuItem>
            ) : null}
          </>
        ) : (
          <MenuItem icon={LogIn} href="/login?callbackURL=%2Fstudio" onSelect={close}>
            {t('menu-sign-in', { defaultValue: 'Sign in to keep projects on your account' })}
          </MenuItem>
        )}
      </AnchoredMenu>
      {versionsOpen ? <ProjectVersionsDialog session={session} onClose={() => setVersionsOpen(false)} /> : null}
    </div>
  );
}
