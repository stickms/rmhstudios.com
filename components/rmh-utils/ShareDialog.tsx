'use client';

import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  accentColor: string;
}

export default function ShareDialog({ open, onClose, accentColor }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Share Document</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 text-center">
          <p className="text-white/50 text-sm">Sharing is not available in offline mode.</p>
        </div>
      </div>
    </div>
  );
}
