import { create } from "zustand";

/**
 * Global open/close state for the mobile navigation sidebar. Shared so the feed
 * header's menu button and the swipe gesture (handled in MobileDrawer) drive the
 * same drawer.
 */
interface SidebarState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
