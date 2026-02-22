/**
 * RMHboxShell — Client-side wrapper for the RMHbox theme system.
 *
 * Wraps children with the themed container, toast notifications,
 * settings menu, and host control modal.
 * Manages light/dark theme class based on persisted settings.
 */
'use client';

import { useCallback } from 'react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import ToastContainer from '@/components/rmhbox/ToastContainer';
import SettingsMenu from '@/components/rmhbox/SettingsMenu';
import HostControlModal from '@/components/rmhbox/HostControlModal';

export default function RMHboxShell({ children }: { children: React.ReactNode }) {
  const theme = useRMHboxStore((s) => s.settings.theme);
  const updateSettings = useRMHboxStore((s) => s.updateSettings);

  const handleToggleTheme = useCallback(() => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, updateSettings]);

  return (
    <div className={`rmhbox-theme ${theme === 'light' ? 'rmhbox-light' : ''}`}>
      <ToastContainer />
      {children}
      <HostControlModal />
      <SettingsMenu theme={theme} onToggleTheme={handleToggleTheme} />
    </div>
  );
}
