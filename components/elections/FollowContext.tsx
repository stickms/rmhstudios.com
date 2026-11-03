import { createContext, useContext } from 'react';

/** The states this viewer follows (the same list the Alerts panel keeps), shared so any card can follow one. */
export interface FollowState {
  states: string[];
  toggle: (postal: string) => void;
}
export const FollowContext = createContext<FollowState>({ states: [], toggle: () => {} });
export const useFollow = () => useContext(FollowContext);
