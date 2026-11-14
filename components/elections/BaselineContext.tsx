import {
  createContext,
  useContext,
} from 'react';
import type { Baseline } from '@/lib/elections/swing';

/** Race id → its 2024 baseline contest, provided once by the page so any race card can show the swing. */
export const BaselineContext =
  createContext<
    Record<
      string,
      Baseline
    >
  >(
    {},
  );
export const useBaselineFor =
  (
    raceId: string,
  ):
    | Baseline
    | undefined =>
    useContext(
      BaselineContext,
    )[
      raceId
    ];
