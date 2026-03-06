import './globals.css';
import { Toaster } from 'sonner';

// TODO: Metadata type removed — handle via TanStack Start route meta

export default function SliceItLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@100..900&display=swap" rel="stylesheet" />
      <div style={{ fontFamily: "'Outfit', sans-serif" }} className="slice-theme min-h-screen text-slate-700 dark:text-slate-200 transition-colors duration-300">
        {children}
        <Toaster />
      </div>
    </>
  );
}
