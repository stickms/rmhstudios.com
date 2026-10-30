/**
 * The /balatro toolbar's multiplayer part, loaded with the MP chunk and drawn
 * only while a multiplayer session runs: the hub connection chip and, in a
 * lobby, the Invite button and popover. State comes from the MP controller
 * (lib/balatro/mp/pack-loader.ts), which reads it off the mailbox.
 */
'use client';

import { UserPlus } from 'lucide-react';
import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui/Tooltip';
import type { MpController } from '@/lib/balatro/mp/pack-loader';
import { ConnectionChip } from './ConnectionChip';
import { InvitePopover } from './InvitePopover';
import './mp.css';

export default function MpToolbar({
  controller,
  container,
}: {
  controller: MpController;
  /** The game frame (the fullscreen element): where the Invite dialog portals. */
  container: HTMLElement | null;
}) {
  const { t } = useTranslation('c-balatro');
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const setOpen = useCallback((open: boolean) => controller.setInviteOpen(open), [controller]);
  if (!state.active) return null;
  return (
    <>
      <ConnectionChip hub={state.hub} />
      {state.code && (
        <Tooltip content={t('mp_invite_hint', { defaultValue: 'Invite players to this lobby' })}>
          <button
            type="button"
            onClick={() => controller.setInviteOpen(!state.inviteOpen)}
            aria-expanded={state.inviteOpen}
            aria-label={t('mp_invite', { defaultValue: 'Invite' })}
          >
            <UserPlus className="size-4" aria-hidden />
          </button>
        </Tooltip>
      )}
      {state.code && (
        <InvitePopover code={state.code} open={state.inviteOpen} onOpenChange={setOpen} container={container} />
      )}
    </>
  );
}
