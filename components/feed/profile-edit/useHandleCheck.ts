import { useCallback, useEffect, useRef } from 'react';
import {
  localHandleStatus,
  remoteHandleStatus,
  sanitizeHandle,
  type ProfileEditInitial,
} from './profile-edit-state';
import type { ProfileEditForm } from './useProfileEditForm';

/**
 * Debounced handle availability check. Each check takes a token; a response
 * for a handle the user has since edited away from is dropped instead of
 * marking the newer handle 'available'.
 */
export function useHandleCheck(
  form: Pick<ProfileEditForm, 'setHandle' | 'setHandleStatus' | 'handleCheckTimeout'>,
  initial: ProfileEditInitial,
) {
  const { setHandle, setHandleStatus, handleCheckTimeout } = form;
  const handleCheckSeq = useRef(0);
  const checkHandle = useCallback(
    async (value: string) => {
      const seq = ++handleCheckSeq.current;
      const local = localHandleStatus(value, initial.handle);
      if (local) {
        setHandleStatus(local);
        return;
      }
      setHandleStatus('checking');
      try {
        const res = await fetch(`/api/handle/check?handle=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { available?: boolean; reason?: string };
        if (seq !== handleCheckSeq.current) return;
        setHandleStatus(remoteHandleStatus(data));
      } catch {
        if (seq === handleCheckSeq.current) setHandleStatus('idle');
      }
    },
    [initial.handle, setHandleStatus],
  );

  const handleHandleChange = (value: string) => {
    const sanitized = sanitizeHandle(value);
    setHandle(sanitized);
    handleCheckSeq.current += 1;
    setHandleStatus('idle');
    if (handleCheckTimeout.current) clearTimeout(handleCheckTimeout.current);
    handleCheckTimeout.current = setTimeout(() => checkHandle(sanitized), 400);
  };

  useEffect(
    () => () => {
      if (handleCheckTimeout.current) clearTimeout(handleCheckTimeout.current);
    },
    [handleCheckTimeout],
  );

  return handleHandleChange;
}
