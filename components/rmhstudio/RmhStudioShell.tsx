/**
 * RmhStudioShell — Client-side wrapper for the RMHStudio theme.
 */
'use client';

export default function RmhStudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rmhstudio-theme">
      {children}
    </div>
  );
}
