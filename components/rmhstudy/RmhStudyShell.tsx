/**
 * RmhStudyShell — Client-side wrapper for the RmhStudy theme system.
 */
'use client';

import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import ToastContainer from '@/components/rmhstudy/ToastContainer';

export default function RmhStudyShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhStudyStore((s) => s.settings.theme) ?? 'dark';

  return (
    <div className={`rmhstudy-theme ${theme === 'light' ? 'rmhstudy-light' : ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
