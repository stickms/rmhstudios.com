/**
 * AltairShell — Client-side wrapper for the Altair theme system.
 *
 * Wraps children with the themed container and toast notifications.
 * Manages light/dark theme class based on persisted settings.
 */
'use client';

import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import ToastContainer from '@/components/altair/ToastContainer';

export default function AltairShell({ children }: { children: React.ReactNode }) {
  const theme = useAltairSettingsStore((s) => s.theme) ?? 'dark';

  return (
    <div className={`altair-theme ${theme === 'light' ? 'altair-light' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
