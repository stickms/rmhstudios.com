/**
 * RmhBrowserShell — Client-side wrapper for the RMHbrowser theme system.
 */
'use client';

import { useRmhBrowserStore } from '@/lib/rmhbrowser/store';
import ToastContainer from '@/components/rmhbrowser/ToastContainer';

const THEME_CLASS_MAP: Record<string, string> = {
  dark: '',
  light: 'rmhbrowser-light',
  ocean: 'rmhbrowser-ocean',
  sunset: 'rmhbrowser-sunset',
  forest: 'rmhbrowser-forest',
};

export default function RmhBrowserShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhBrowserStore((s) => s.settings.theme) ?? 'dark';

  return (
    <div className={`rmhbrowser-theme ${THEME_CLASS_MAP[theme] ?? ''}`}>
      <ToastContainer />
      {children}
    </div>
  );
}
