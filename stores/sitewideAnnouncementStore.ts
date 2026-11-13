import { create } from 'zustand';

/**
 * Open state of the sitewide announcement popup. The popup opens itself when
 * there is an unseen announcement; the feed row calls `setOpen(true)` to
 * reopen it on demand.
 *
 * `whatsNewOpen` is mirrored in by the "What's new" release dialog so the two
 * never share the screen: the announcement waits while it is true.
 */
interface SitewideAnnouncementState {
  open: boolean;
  setOpen: (open: boolean) => void;
  whatsNewOpen: boolean;
  setWhatsNewOpen: (open: boolean) => void;
}

export const useSitewideAnnouncementStore = create<SitewideAnnouncementState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  whatsNewOpen: false,
  setWhatsNewOpen: (whatsNewOpen) => set({ whatsNewOpen }),
}));
