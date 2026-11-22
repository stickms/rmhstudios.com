import { createContext, useContext } from 'react';
import { NO_ASSIST_FLAGS, type SynapseAssistFlags } from '../engine/assist-profile';

/** The assist flags of the run in progress, for the cards and the board. Multiplayer renders without a provider. */
export const SynapseAssistContext = createContext<SynapseAssistFlags>(NO_ASSIST_FLAGS);

export function useSynapseAssist(): SynapseAssistFlags {
  return useContext(SynapseAssistContext);
}
