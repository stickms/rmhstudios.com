'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';

interface Repo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
}

interface CloneRepoDialogProps {
  onConfirm: (owner: string, repo: string, branch: string) => Promise<{ error?: string }>;
  onClose: () => void;
}

export default function CloneRepoDialog({ onConfirm, onClose }: CloneRepoDialogProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState(false);
  const [selected, setSelected] = useState('');
  const [branch, setBranch] = useState('main');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/rmh-code/github/repos')
      .then(r => r.json())
      .then(d => {
        setRepos(d.repos ?? []);
        if (d.repos?.length > 0) {
          setSelected(d.repos[0].fullName);
          setBranch(d.repos[0].defaultBranch ?? 'main');
        }
      })
      .catch(() => setError('Failed to load repositories'))
      .finally(() => setLoading(false));
  }, []);

  function handleRepoChange(fullName: string) {
    setSelected(fullName);
    const repo = repos.find(r => r.fullName === fullName);
    if (repo) setBranch(repo.defaultBranch ?? 'main');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setCloning(true);
    const [owner, repo] = selected.split('/');
    const result = await onConfirm(owner, repo, branch);
    setCloning(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#454545] rounded-lg shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Clone Repository</h2>
          <button onClick={onClose} className="text-[#858585] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-[#858585] py-4">
            <RefreshCw size={14} className="animate-spin" />
            Loading repositories…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="block text-xs text-[#858585] mb-1">Repository</label>
              <select
                value={selected}
                onChange={e => handleRepoChange(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#007acc] appearance-none"
              >
                {repos.map(r => (
                  <option key={r.id} value={r.fullName}>
                    {r.private ? '🔒 ' : ''}{r.fullName}
                  </option>
                ))}
              </select>
              {repos.find(r => r.fullName === selected)?.description && (
                <p className="text-xs text-[#858585] mt-1 truncate">
                  {repos.find(r => r.fullName === selected)?.description}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-xs text-[#858585] mb-1">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className="w-full bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-[#007acc]"
              />
            </div>

            {error && <p className="text-xs text-[#f48771] mb-3">{error}</p>}

            <p className="text-[10px] text-[#858585] mb-3">
              Text files only — binary assets and node_modules are skipped. Max 200 files.
            </p>

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
                disabled={!selected || cloning}
                className="px-3 py-1.5 text-sm bg-[#007acc] text-white rounded hover:bg-[#1a8ad4] disabled:opacity-40 transition-colors"
              >
                {cloning ? 'Cloning…' : 'Clone'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
