import { create } from 'zustand';

/**
 * Open state of the sitewide announcement popup. The popup opens itself when
 * there is an unseen announcement; the feed card calls `setOpen(true)` to
 * reopen it on demand.
 */
interface SitewideAnnouncementState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useSitewideAnnouncementStore = create<SitewideAnnouncementState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
