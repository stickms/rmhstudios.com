'use client';

import { useState } from 'react';
import { X, ExternalLink, Eye, EyeOff } from 'lucide-react';

interface GitConnectDialogProps {
  onConfirm: (token: string) => Promise<{ error?: string }>;
  onClose: () => void;
}

export default function GitConnectDialog({ onConfirm, onClose }: GitConnectDialogProps) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await onConfirm(token.trim());
    setLoading(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#454545] rounded-lg shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Connect GitHub</h2>
          <button onClick={onClose} className="text-[#858585] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#858585] mb-1">
          Enter a GitHub Personal Access Token (PAT) with <code className="text-[#9cdcfe]">repo</code> scope.
        </p>
        <a
          href="https://github.com/settings/tokens/new?scopes=repo&description=RMH+Code"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[#007acc] hover:underline mb-4"
        >
          Generate token on GitHub <ExternalLink size={11} />
        </a>

        <form onSubmit={handleSubmit}>
          <div className="relative mb-3">
            <input
              autoFocus
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 pr-9 text-sm text-white placeholder-[#858585] focus:outline-none focus:border-[#007acc] font-mono"
            />
            <button
              type="button"
              onClick={() => setShowToken(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#858585] hover:text-white transition-colors"
            >
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && <p className="text-xs text-[#f48771] mb-3">{error}</p>}

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
              disabled={!token.trim() || loading}
              className="px-3 py-1.5 text-sm bg-[#007acc] text-white rounded hover:bg-[#1a8ad4] disabled:opacity-40 transition-colors"
            >
              {loading ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
