'use client';

import { useEffect } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

export default function Modal({ title, onClose, children, wide = false }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--notes-surface)',
          border: '1px solid var(--notes-border)',
          width: wide ? 640 : 480,
          maxWidth: '95vw',
          maxHeight: '85vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--notes-border)' }}>
          <h2 className="font-bold text-base" style={{ color: 'var(--notes-text)' }}>{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-sm hover:opacity-70 transition-opacity"
            style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)' }}
          >✕</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
