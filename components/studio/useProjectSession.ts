/**
 * The Studio's project session: which project is open, whether it has unsaved changes, and every way to keep it,
 * open another, or sync it with the member's account. The rules live in `lib/studio/project-session.ts` (pure);
 * this wires them to the store, the IndexedDB project store and the cloud-projects API.
 *
 * - Autosave writes the LOCAL copy 30 s after the last change (a `setTimeout`, never a frame callback) and on
 *   `pagehide`. It never uploads: the account copy changes only when the member saves to the account, and from then
 *   on Save updates both.
 * - A cloud save names the revision it started from. A stale one is refused with the current revision and the
 *   member chooses: overwrite the account copy, or open it (`conflict`).
 * - Which local projects have an account copy is remembered per member in this browser (`cloudLinks`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/session-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { api, errorField } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { readString, writeString } from '@/lib/core/persist';
import { toast } from '@/lib/toast';
import {
  deleteProject,
  listSamples,
  loadProject,
  saveProject,
} from '@/lib/studio/project-store';
import {
  autosaveDecision,
  buildProject,
  contentChanged,
  countMissingSamples,
  deriveSaveState,
  freshClock,
  isDirty,
  markPristine,
  normalizeProjectName,
  parseCloudLinks,
  recordChange,
  recordSaved,
  savesOnPageHide,
  warnsBeforeUnload,
  withLink,
  withoutLink,
  type ChangeClock,
  type CloudLinks,
  type SaveState,
} from '@/lib/studio/project-session';
import {
  MAX_CLOUD_PROJECTS,
  MAX_PROJECT_NAME,
} from '@/lib/studio/project-schema';
import {
  createCloudProjectApi,
  deleteCloudProjectApi,
  getCloudProjectApi,
  listCloudProjectsApi,
  updateCloudProjectApi,
  type CloudSaveRefusal,
} from '@/lib/studio/projects.contract';
import { useStudioStore } from '@/lib/studio/store';
import type { Project } from '@/lib/studio/types';

export type OpenTab = 'device' | 'account';

/** A cloud save the account refused because its copy moved on; the member picks what happens next. */
export interface ProjectConflict {
  id: string;
  name: string;
  /** The account copy's current revision. */
  revision: number;
}

export interface ProjectSession {
  signedIn: boolean;
  name: string;
  saveState: SaveState;
  /** The open project has a copy on the account. */
  linked: boolean;
  /** The open project has been saved on this device (it has an id). */
  hasId: boolean;
  /** The id of the open project, null until it is first saved. */
  projectId: string | null;
  /** Local-copy ids that also exist on the account, for the Open list. */
  cloudLinks: CloudLinks;
  /** Which list the Open dialog shows, or null while it is closed. */
  openDialog: OpenTab | null;
  setOpenDialog: (tab: OpenTab | null) => void;
  conflict: ProjectConflict | null;
  resolveConflict: (choice: 'overwrite' | 'open-newer' | 'cancel') => Promise<void>;
  newProject: () => Promise<void>;
  save: () => Promise<void>;
  saveAs: () => Promise<void>;
  rename: () => Promise<void>;
  deleteCurrent: () => Promise<void>;
  saveToAccount: () => Promise<void>;
  deleteCurrentFromAccount: () => Promise<void>;
  /** Open a project; false when it could not be opened (the member was told why). */
  openLocal: (id: string) => Promise<boolean>;
  openCloud: (id: string) => Promise<boolean>;
  deleteLocalById: (id: string, name: string) => Promise<boolean>;
  deleteCloudById: (id: string, name: string) => Promise<boolean>;
  /** The keybind handler for Ctrl/Cmd+S and Ctrl+Shift+S. */
  onProjectAction: (action: 'save' | 'saveAs') => void;
}

const linksKey = (userId: string) => `rmh-studio-cloud-links:${userId}`;

function content() {
  return useStudioStore.getState();
}

function isStaleOrExists(code: unknown): code is 'stale' | 'exists' {
  return code === 'stale' || code === 'exists';
}

export function useProjectSession(): ProjectSession {
  const { t } = useTranslation('studio-projects');
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const confirm = useConfirm();
  const prompt = usePrompt();
  const queryClient = useQueryClient();

  const projectId = useStudioStore((s) => s.projectId);
  const name = useStudioStore((s) => s.projectName);

  const clockRef = useRef<ChangeClock>(freshClock());
  const createdAtRef = useRef<number | null>(null);
  const loadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [openDialog, setOpenDialog] = useState<OpenTab | null>(null);
  const [conflict, setConflict] = useState<ProjectConflict | null>(null);
  const [cloudLinks, setCloudLinks] = useState<CloudLinks>({});
  const linksRef = useRef<CloudLinks>({});

  // ─── Account links, per member, in this browser ──────────────────────────
  useEffect(() => {
    const links = userId ? parseCloudLinks(readString(linksKey(userId))) : {};
    linksRef.current = links;
    setCloudLinks(links);
  }, [userId]);

  const setLinks = useCallback(
    (next: CloudLinks) => {
      linksRef.current = next;
      setCloudLinks(next);
      if (userId) writeString(linksKey(userId), JSON.stringify(next));
    },
    [userId],
  );

  // ─── Change tracking ─────────────────────────────────────────────────────
  const syncDirty = useCallback(() => setDirty(isDirty(clockRef.current)), []);

  /** Load something into the store without it counting as an edit. */
  const loadIntoStore = useCallback(
    (apply: () => void, createdAt: number | null) => {
      loadingRef.current = true;
      try {
        apply();
      } finally {
        loadingRef.current = false;
      }
      createdAtRef.current = createdAt;
      clockRef.current = markPristine(clockRef.current);
      setFailed(false);
      syncDirty();
    },
    [syncDirty],
  );

  // ─── Saving the local copy ───────────────────────────────────────────────
  const writeLocal = useCallback(async (): Promise<boolean> => {
    const state = content();
    let id = state.projectId;
    if (!id) {
      id = crypto.randomUUID();
      state.setProjectIdentity(id, state.projectName);
    }
    const covered = clockRef.current.changeCount;
    const now = Date.now();
    createdAtRef.current ??= now;
    setSaving(true);
    try {
      await saveProject(buildProject(id, content(), createdAtRef.current, now));
      clockRef.current = recordSaved(clockRef.current, covered);
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setSaving(false);
      syncDirty();
    }
  }, [syncDirty]);

  const arm = useCallback(() => {
    clearTimeout(timerRef.current);
    const decision = autosaveDecision(clockRef.current, Date.now());
    if (decision.kind === 'wait') timerRef.current = setTimeout(arm, decision.ms);
    else if (decision.kind === 'save') void writeLocal();
  }, [writeLocal]);

  useEffect(() => {
    let previous = useStudioStore.getState();
    const unsubscribe = useStudioStore.subscribe((next) => {
      if (!loadingRef.current && contentChanged(previous, next)) {
        clockRef.current = recordChange(clockRef.current, Date.now());
        syncDirty();
        arm();
      }
      previous = next;
    });
    return () => {
      unsubscribe();
      clearTimeout(timerRef.current);
    };
  }, [arm, syncDirty]);

  // Closing the tab: the browser's own warning while anything is unsaved, and a last local write.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!warnsBeforeUnload(clockRef.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const pageHide = () => {
      if (savesOnPageHide(clockRef.current)) void writeLocal();
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', pageHide);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pagehide', pageHide);
    };
  }, [writeLocal]);

  // ─── Helpers ─────────────────────────────────────────────────────────────
  /** True when it is fine to replace the open project: nothing unsaved, or the member said discard. */
  const canDiscard = useCallback(async (): Promise<boolean> => {
    if (!isDirty(clockRef.current)) return true;
    return confirm({
      title: t('discard-title', { defaultValue: 'Discard unsaved changes?' }),
      description: t('discard-description', {
        defaultValue: 'The project has changes that are not saved yet. They will be lost.',
      }),
      confirmLabel: t('discard-confirm', { defaultValue: 'Discard' }),
      cancelLabel: t('discard-cancel', { defaultValue: 'Keep editing' }),
      danger: true,
    });
  }, [confirm, t]);

  const refreshCloudList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [listCloudProjectsApi.path] }),
    [queryClient],
  );

  /** Tell the member how many audio clips lost their sample on this device; the clips stay and play silent. */
  const noticeMissingSamples = useCallback(async () => {
    try {
      const available = new Set((await listSamples()).map((sample) => sample.id));
      const missing = countMissingSamples(content().clips, available);
      if (missing > 0) {
        toast.warning(
          t('missing-samples', {
            count: missing,
            defaultValue_one: '{{count}} sample is not on this device. Its clips stay silent.',
            defaultValue_other: '{{count}} samples are not on this device. Their clips stay silent.',
            defaultValue: '{{count}} samples are not on this device. Their clips stay silent.',
          }),
        );
      }
    } catch {
      // Sample storage unavailable: there is nothing reliable to report.
    }
  }, [t]);

  const showRefusal = useCallback(
    (code: CloudSaveRefusal | undefined) => {
      if (code === 'limit') {
        toast.error(
          t('limit-reached', {
            max: MAX_CLOUD_PROJECTS,
            defaultValue:
              'You can keep {{max}} projects on your account. Delete one to save this.',
          }),
        );
      } else if (code === 'too-large') {
        toast.error(
          t('too-large', {
            defaultValue: 'This project is too large for your account. Remove audio or clips and try again.',
          }),
        );
      } else if (code === 'id-taken') {
        toast.error(
          t('id-taken', {
            defaultValue: 'This project cannot be saved to your account. Use Save as to make a copy.',
          }),
        );
      } else {
        toast.error(t('save-account-failed', { defaultValue: 'Could not save to your account.' }));
      }
    },
    [t],
  );

  // ─── Saving to the account ───────────────────────────────────────────────
  /** Upload the open project. `baseRevision` is the account copy's revision this edit started from, if any. */
  const pushCloud = useCallback(
    async (baseRevision: number | undefined, allowRecreate = true): Promise<boolean> => {
      const state = content();
      const id = state.projectId;
      if (!id) return false;
      const projectName = state.projectName.trim().slice(0, MAX_PROJECT_NAME) || 'Untitled Project';
      const data: Project = buildProject(id, { ...state, projectName }, createdAtRef.current ?? Date.now(), Date.now());
      setSaving(true);
      try {
        const { project } =
          baseRevision === undefined
            ? await api(createCloudProjectApi, { body: { id, name: projectName, data } })
            : await api(updateCloudProjectApi, {
                params: { id },
                body: { name: projectName, data, baseRevision },
              });
        setLinks(withLink(linksRef.current, id, project.revision));
        setFailed(false);
        void refreshCloudList();
        return true;
      } catch (error) {
        const code = errorField<CloudSaveRefusal>(error, 'code');
        if (error instanceof HttpError && error.status === 409 && isStaleOrExists(code)) {
          const revision = errorField<number>(error, 'revision');
          if (typeof revision === 'number') setConflict({ id, name: projectName, revision });
        } else if (code === 'not-found' && baseRevision !== undefined && allowRecreate) {
          // Deleted from the account on another device: this save puts it back.
          setLinks(withoutLink(linksRef.current, id));
          return await pushCloud(undefined, false);
        } else {
          setFailed(true);
          showRefusal(code);
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refreshCloudList, setLinks, showRefusal],
  );

  const saveToAccount = useCallback(async () => {
    if (!userId) return;
    if (!(await writeLocal())) return;
    const id = content().projectId;
    if (!id) return;
    const ok = await pushCloud(linksRef.current[id]);
    if (ok) toast.success(t('saved-account', { defaultValue: 'Saved to your account.' }));
  }, [pushCloud, t, userId, writeLocal]);

  // ─── Save, Save as, Rename ───────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!(await writeLocal())) {
      toast.error(t('save-failed', { defaultValue: 'Could not save this project on this device.' }));
      return;
    }
    const id = content().projectId;
    if (userId && id && linksRef.current[id] !== undefined) await pushCloud(linksRef.current[id]);
  }, [pushCloud, t, userId, writeLocal]);

  const askName = useCallback(
    (title: string, initialValue: string, confirmLabel: string) =>
      prompt({
        title,
        label: t('name-label', { defaultValue: 'Project name' }),
        initialValue,
        confirmLabel,
        cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
        validate: (value) =>
          normalizeProjectName(value)
            ? null
            : t('name-invalid', {
                max: MAX_PROJECT_NAME,
                defaultValue: 'Enter a name of 1 to {{max}} characters.',
              }),
      }),
    [prompt, t],
  );

  const saveAs = useCallback(async () => {
    const raw = await askName(
      t('save-as-title', { defaultValue: 'Save a copy as' }),
      content().projectName,
      t('save-as-confirm', { defaultValue: 'Save copy' }),
    );
    const next = raw === null ? null : normalizeProjectName(raw);
    if (!next) return;
    createdAtRef.current = Date.now();
    content().setProjectIdentity(crypto.randomUUID(), next);
    if (await writeLocal()) toast.success(t('saved-as', { name: next, defaultValue: 'Saved as {{name}}.' }));
    else toast.error(t('save-failed', { defaultValue: 'Could not save this project on this device.' }));
  }, [askName, t, writeLocal]);

  const rename = useCallback(async () => {
    const raw = await askName(
      t('rename-title', { defaultValue: 'Rename project' }),
      content().projectName,
      t('rename-confirm', { defaultValue: 'Rename' }),
    );
    const next = raw === null ? null : normalizeProjectName(raw);
    if (!next) return;
    content().setProjectIdentity(content().projectId, next);
    await save();
  }, [askName, save, t]);

  // ─── New, open ───────────────────────────────────────────────────────────
  const newProject = useCallback(async () => {
    if (!(await canDiscard())) return;
    loadIntoStore(() => content().newProject(), null);
  }, [canDiscard, loadIntoStore]);

  const applyProject = useCallback(
    (project: Project, projectName: string) => {
      loadIntoStore(
        () =>
          content().setProject(
            project.id,
            projectName,
            project.tracks,
            project.clips,
            project.patterns,
            project.bpm,
            project.timeSignature,
            project.masterVolume,
          ),
        project.createdAt,
      );
    },
    [loadIntoStore],
  );

  const openLocal = useCallback(
    async (id: string): Promise<boolean> => {
      if (!(await canDiscard())) return false;
      try {
        const project = await loadProject(id);
        if (!project) {
          toast.error(t('open-missing', { defaultValue: 'That project is no longer on this device.' }));
          return false;
        }
        applyProject(project, project.name);
        void noticeMissingSamples();
        return true;
      } catch {
        toast.error(t('open-failed', { defaultValue: 'Could not open that project.' }));
        return false;
      }
    },
    [applyProject, canDiscard, noticeMissingSamples, t],
  );

  /** Fetch an account project and make it the open one; also keeps a local copy so autosave continues from it. */
  const loadCloud = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const { project } = await api(getCloudProjectApi, { params: { id } });
        applyProject({ ...project.data, id: project.id }, project.name);
        setLinks(withLink(linksRef.current, project.id, project.revision));
        await writeLocal();
        void noticeMissingSamples();
        return true;
      } catch {
        toast.error(t('open-account-failed', { defaultValue: 'Could not open that project from your account.' }));
        return false;
      }
    },
    [applyProject, noticeMissingSamples, setLinks, t, writeLocal],
  );

  const openCloud = useCallback(
    async (id: string): Promise<boolean> => {
      if (!(await canDiscard())) return false;
      return loadCloud(id);
    },
    [canDiscard, loadCloud],
  );

  const resolveConflict = useCallback(
    async (choice: 'overwrite' | 'open-newer' | 'cancel') => {
      const pending = conflict;
      setConflict(null);
      if (!pending || choice === 'cancel') return;
      if (choice === 'overwrite') {
        if (await pushCloud(pending.revision)) {
          toast.success(t('saved-account', { defaultValue: 'Saved to your account.' }));
        }
        return;
      }
      await loadCloud(pending.id);
    },
    [conflict, loadCloud, pushCloud, t],
  );

  // ─── Delete ──────────────────────────────────────────────────────────────
  const confirmDelete = useCallback(
    (title: string, description: string, label: string) =>
      confirm({
        title,
        description,
        confirmLabel: label,
        cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
        danger: true,
      }),
    [confirm, t],
  );

  const deleteLocalById = useCallback(
    async (id: string, projectName: string): Promise<boolean> => {
      const ok = await confirmDelete(
        t('delete-local-title', { name: projectName, defaultValue: 'Delete {{name}} from this device?' }),
        t('delete-local-description', {
          defaultValue: 'The copy on your account, if there is one, is not deleted.',
        }),
        t('delete-confirm', { defaultValue: 'Delete' }),
      );
      if (!ok) return false;
      try {
        await deleteProject(id);
      } catch {
        toast.error(t('delete-failed', { defaultValue: 'Could not delete that project.' }));
        return false;
      }
      if (content().projectId === id) loadIntoStore(() => content().newProject(), null);
      return true;
    },
    [confirmDelete, loadIntoStore, t],
  );

  const deleteCloudById = useCallback(
    async (id: string, projectName: string): Promise<boolean> => {
      const ok = await confirmDelete(
        t('delete-account-title', { name: projectName, defaultValue: 'Delete {{name}} from your account?' }),
        t('delete-account-description', {
          defaultValue: 'It is removed from every device. A copy kept on this device is not deleted.',
        }),
        t('delete-confirm', { defaultValue: 'Delete' }),
      );
      if (!ok) return false;
      try {
        await api(deleteCloudProjectApi, { params: { id } });
      } catch (error) {
        // Already gone elsewhere is the outcome asked for.
        if (!(error instanceof HttpError && error.status === 404)) {
          toast.error(t('delete-failed', { defaultValue: 'Could not delete that project.' }));
          return false;
        }
      }
      setLinks(withoutLink(linksRef.current, id));
      void refreshCloudList();
      return true;
    },
    [confirmDelete, refreshCloudList, setLinks, t],
  );

  const deleteCurrent = useCallback(async () => {
    const id = content().projectId;
    if (id) await deleteLocalById(id, content().projectName);
  }, [deleteLocalById]);

  const deleteCurrentFromAccount = useCallback(async () => {
    const id = content().projectId;
    if (id) await deleteCloudById(id, content().projectName);
  }, [deleteCloudById]);

  const onProjectAction = useCallback(
    (action: 'save' | 'saveAs') => {
      void (action === 'save' ? save() : saveAs());
    },
    [save, saveAs],
  );

  const linked = projectId !== null && cloudLinks[projectId] !== undefined;

  return useMemo(
    () => ({
      signedIn: userId !== null,
      name,
      saveState: deriveSaveState({ dirty, saving, failed }),
      linked,
      hasId: projectId !== null,
      projectId,
      cloudLinks,
      openDialog,
      setOpenDialog,
      conflict,
      resolveConflict,
      newProject,
      save,
      saveAs,
      rename,
      deleteCurrent,
      saveToAccount,
      deleteCurrentFromAccount,
      openLocal,
      openCloud,
      deleteLocalById,
      deleteCloudById,
      onProjectAction,
    }),
    [
      userId,
      name,
      dirty,
      saving,
      failed,
      linked,
      projectId,
      cloudLinks,
      openDialog,
      conflict,
      resolveConflict,
      newProject,
      save,
      saveAs,
      rename,
      deleteCurrent,
      saveToAccount,
      deleteCurrentFromAccount,
      openLocal,
      openCloud,
      deleteLocalById,
      deleteCloudById,
      onProjectAction,
    ],
  );
}
