/**
 * RMHboxShell — Client-side wrapper for the RMHbox theme system.
 *
 * Wraps children with the themed container and toast notifications.
 * Manages light/dark theme class based on persisted settings.
 *
 * Settings and host control modals are now rendered inline within
 * the RMHboxHeader component, not as floating overlays here.
 */
'use client';

import { useRMHboxStore } from '@/lib/rmhbox/store';
import ToastContainer from '@/components/rmhbox/ToastContainer';

export default function RMHboxShell({ children }: { children: React.ReactNode }) {
  const theme = useRMHboxStore((s) => s.settings.theme) ?? 'dark';

  return (
    <div className={`rmhbox-theme ${theme === 'light' ? 'rmhbox-light' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
