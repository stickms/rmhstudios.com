/**
 * RmhTubeShell — Client-side wrapper for the RmhTube theme system.
 *
 * Wraps children with the themed container and toast notifications.
 */
'use client';

import { useRmhTubeStore } from '@/lib/rmhtube/store';
import ToastContainer from '@/components/rmhtube/ToastContainer';

export default function RmhTubeShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhTubeStore((s) => s.settings.theme) ?? 'dark';

  return (
    <div className={`rmhtube-theme ${theme === 'light' ? 'rmhtube-light' : theme === 'high-contrast' ? 'rmhtube-high-contrast' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
