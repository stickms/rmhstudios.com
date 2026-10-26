/**
 * Saving a signed-in HUD to the account: the explicit save (Ctrl+S) and the
 * background autosave share one code path so they cannot disagree about what
 * is dirty. Autosaves are marked so the server folds them into one history
 * entry instead of burying real versions under hundreds of keystroke saves.
 */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { ApiError } from '@/lib/tf2-hud/api';
import { saveExisting, validateForCloud } from '@/lib/tf2-hud/cloud';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { useEditor } from '@/lib/tf2-hud/store';

const AUTOSAVE_DELAY = 4000;
const RETRY_DELAY = 15000;

export function useCloudSave() {
  const { t } = useTranslation('c-tf2-hud');
  const { data: session } = useSession();
  const inflight = useRef(false);
  const signedIn = Boolean(session);

  /** Save the open HUD now. Returns false when there is nowhere to save to yet. */
  const save = useCallback(
    async (autosave: boolean): Promise<boolean> => {
      const s = useEditor.getState();
      if (!signedIn || !s.remoteId) return false;
      if (inflight.current) return true;
      const problem = validateForCloud(s.overlay);
      if (problem) {
        if (!autosave) toast.error(problem);
        s.setSaveState('error');
        return true;
      }
      inflight.current = true;
      s.setSaveState('saving');
      const snapshot = s.overlay;
      try {
        await saveExisting(s.remoteId, s.meta, s.overlay, undefined, undefined, autosave);
        // Edits made while the request was in flight keep the HUD marked dirty.
        const now = useEditor.getState();
        now.setSaveState(now.overlay === snapshot ? 'saved' : 'dirty');
        if (!autosave) toast.success(t('saved-account', { defaultValue: 'Saved to your account' }));
      } catch (e) {
        useEditor.getState().setSaveState('error');
        if (!autosave) {
          toast.error(
            e instanceof ApiError
              ? e.message
              : t('save-failed', { defaultValue: 'Could not save. Try again.' }),
          );
        }
      } finally {
        inflight.current = false;
      }
      return true;
    },
    [signedIn, t],
  );

  const enabled = useTf2HudPrefs((p) => p.cloudAutosave);
  const saveState = useEditor((s) => s.saveState);
  const overlay = useEditor((s) => s.overlay);
  const meta = useEditor((s) => s.meta);
  const remoteId = useEditor((s) => s.remoteId);

  useEffect(() => {
    if (!enabled || !signedIn || !remoteId) return;
    if (saveState !== 'dirty' && saveState !== 'error') return;
    const timer = setTimeout(
      () => void save(true),
      saveState === 'error' ? RETRY_DELAY : AUTOSAVE_DELAY,
    );
    return () => clearTimeout(timer);
    // Every edit restarts the timer, so a save happens once typing pauses.
  }, [enabled, signedIn, remoteId, saveState, overlay, meta, save]);

  return { save, canQuickSave: signedIn && Boolean(remoteId) };
}
