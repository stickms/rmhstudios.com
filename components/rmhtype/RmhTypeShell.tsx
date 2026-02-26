/**
 * RmhTypeShell — Client-side wrapper for the RmhType theme system.
 */
'use client';

import { useRmhTypeStore } from '@/lib/rmhtype/store';
import ToastContainer from '@/components/rmhtype/ToastContainer';

export default function RmhTypeShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhTypeStore((s) => s.settings.theme) ?? 'dark';

  return (
    <div className={`rmhtype-theme ${theme === 'light' ? 'rmhtype-light' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
