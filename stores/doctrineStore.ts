/**
 * Doctrine Engine — Zustand Store
 *
 * Client-side state for Sahur mode, theme overrides, and live updates.
 */

import { create } from 'zustand';
import type { SahurModeConfig } from '@/lib/doctrine/types';

type DoctrineTheme = 'default' | 'safehouse' | 'coalition' | 'sahur';

interface DoctrineState {
  // Sahur Mode
  sahurActive: boolean;
  sahurConfig: SahurModeConfig | null;
  sahurCountdown: number; // minutes

  // Theme
  doctrineTheme: DoctrineTheme;

  // Live incidents
  activeIncidentCount: number;

  // Actions
  setSahurActive: (active: boolean, config?: SahurModeConfig | null) => void;
  setSahurCountdown: (minutes: number) => void;
  setDoctrineTheme: (theme: DoctrineTheme) => void;
  setActiveIncidentCount: (count: number) => void;
}

export const useDoctrineStore = create<DoctrineState>((set) => ({
  sahurActive: false,
  sahurConfig: null,
  sahurCountdown: 0,
  doctrineTheme: 'default',
  activeIncidentCount: 0,

  setSahurActive: (active, config = null) => set({ sahurActive: active, sahurConfig: config }),
  setSahurCountdown: (minutes) => set({ sahurCountdown: minutes }),
  setDoctrineTheme: (theme) => set({ doctrineTheme: theme }),
  setActiveIncidentCount: (count) => set({ activeIncidentCount: count }),
}));
