'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface NewFileDialogProps {
  onConfirm: (path: string) => void;
  onClose: () => void;
}

export default function NewFileDialog({ onConfirm, onClose }: NewFileDialogProps) {
  const [path, setPath] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = path.trim().replace(/^\/+/, '');
    if (trimmed) onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#454545] rounded-lg shadow-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">New File</h2>
          <button onClick={onClose} className="text-[#858585] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[#858585] mb-4">Include path segments to create in a folder (e.g. src/index.ts)</p>
        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="src/index.ts"
            maxLength={500}
            className="w-full bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 text-sm text-white placeholder-[#858585] focus:outline-none focus:border-[#007acc] mb-4 font-mono"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-[#ccc] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!path.trim()}
              className="px-3 py-1.5 text-sm bg-[#007acc] text-white rounded hover:bg-[#1a8ad4] disabled:opacity-40 transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
