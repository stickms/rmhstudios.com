'use client';

import { useEffect, useState } from 'react';
import { Github, GitBranch, Upload, Unlink, RefreshCw, Check, AlertCircle } from 'lucide-react';
import GitConnectDialog from './GitConnectDialog';
import CloneRepoDialog from './CloneRepoDialog';
import type { ProjectMeta } from './utils';

interface GitPanelProps {
  activeProject: ProjectMeta | null;
  files: Array<{ updatedAt: string }>;
  onCloneSuccess: () => void;
  onPushSuccess: () => void;
}

interface GitStatus {
  connected: boolean;
  login: string | null;
}

export default function GitPanel({ activeProject, files, onCloneSuccess, onPushSuccess }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [showClone, setShowClone] = useState(false);
  const [pushState, setPushState] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle');
  const [pushMsg, setPushMsg] = useState('');
  const [commitMessage, setCommitMessage] = useState('Update via RMH Code');

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    const res = await fetch('/api/rmh-code/github/token');
    if (res.ok) setStatus(await res.json());
  }

  async function handleConnect(token: string) {
    const res = await fetch('/api/rmh-code/github/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Connection failed' };
    setStatus({ connected: true, login: data.login });
    setShowConnect(false);
    return {};
  }

  async function handleDisconnect() {
    if (!confirm('Disconnect GitHub? You will need to re-enter your PAT to reconnect.')) return;
    await fetch('/api/rmh-code/github/token', { method: 'DELETE' });
    setStatus({ connected: false, login: null });
  }

  async function handleClone(owner: string, repo: string, branch: string) {
    const res = await fetch('/api/rmh-code/github/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, branch }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error ?? 'Clone failed' };
    setShowClone(false);
    onCloneSuccess();
    return {};
  }

  async function handlePush() {
    if (!activeProject) return;
    setPushState('pushing');
    setPushMsg('');
    const res = await fetch('/api/rmh-code/github/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: activeProject.id, message: commitMessage }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPushState('error');
      setPushMsg(data.error ?? 'Push failed');
      return;
    }
    setPushState('done');
    setPushMsg(`Pushed ${data.pushed} file${data.pushed !== 1 ? 's' : ''}${data.failed ? ` (${data.failed} failed)` : ''}`);
    setTimeout(() => setPushState('idle'), 3000);
    onPushSuccess();
  }

  const hasGitProject = activeProject && (activeProject as ProjectMeta & { gitOwner?: string }).gitOwner;

  return (
    <div className="flex flex-col h-full bg-[#252526] text-[#ccc] select-none">
      {/* Header */}
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#bbb] border-b border-[#3c3c3c] shrink-0">
        Source Control
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* GitHub connection status */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#858585] font-semibold mb-2">GitHub</p>
          {!status ? (
            <div className="flex items-center gap-1.5 text-[#858585]">
              <RefreshCw size={12} className="animate-spin" /> Loading…
            </div>
          ) : status.connected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <Github size={14} />
                <span className="font-mono">{status.login}</span>
              </div>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 text-[#858585] hover:text-red-400 transition-colors text-xs"
              >
                <Unlink size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[#858585]">Not connected to GitHub.</p>
              <button
                onClick={() => setShowConnect(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#007acc] text-white rounded hover:bg-[#1a8ad4] transition-colors"
              >
                <Github size={13} /> Connect GitHub
              </button>
            </div>
          )}
        </div>

        {/* Clone section */}
        {status?.connected && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#858585] font-semibold mb-2">Clone</p>
            <button
              onClick={() => setShowClone(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-white rounded transition-colors w-full"
            >
              <GitBranch size={13} /> Clone Repository…
            </button>
          </div>
        )}

        {/* Push section (only for git-linked projects) */}
        {hasGitProject && status?.connected && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#858585] font-semibold mb-2">Push</p>
            <div className="bg-[#1e1e1e] rounded p-2 mb-2 text-[#858585] font-mono text-[10px] leading-relaxed">
              <span className="text-[#007acc]">origin/</span>
              {(activeProject as ProjectMeta & { gitBranch?: string }).gitBranch ?? 'main'}
              <br />
              <span className="text-[#858585]">{(activeProject as ProjectMeta & { gitOwner?: string; gitRepo?: string }).gitOwner}/{(activeProject as ProjectMeta & { gitOwner?: string; gitRepo?: string }).gitRepo}</span>
            </div>
            <textarea
              value={commitMessage}
              onChange={e => setCommitMessage(e.target.value)}
              placeholder="Commit message…"
              rows={2}
              className="w-full bg-[#3c3c3c] border border-[#555] rounded px-2 py-1.5 text-xs text-white placeholder-[#858585] focus:outline-none focus:border-[#007acc] resize-none font-mono mb-2"
            />
            <button
              onClick={handlePush}
              disabled={pushState === 'pushing'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#007acc] text-white rounded hover:bg-[#1a8ad4] disabled:opacity-50 transition-colors w-full justify-center"
            >
              {pushState === 'pushing' ? (
                <><RefreshCw size={13} className="animate-spin" /> Pushing…</>
              ) : pushState === 'done' ? (
                <><Check size={13} className="text-green-400" /> {pushMsg}</>
              ) : (
                <><Upload size={13} /> Push Changes</>
              )}
            </button>
            {pushState === 'error' && (
              <p className="flex items-start gap-1 text-[#f48771] text-[10px] mt-1.5">
                <AlertCircle size={11} className="shrink-0 mt-0.5" />{pushMsg}
              </p>
            )}
          </div>
        )}

        {!status?.connected && !hasGitProject && (
          <p className="text-[#555] text-[10px] text-center pt-4 leading-relaxed">
            Connect GitHub to clone repositories and push changes.
          </p>
        )}
      </div>

      {showConnect && (
        <GitConnectDialog onConfirm={handleConnect} onClose={() => setShowConnect(false)} />
      )}
      {showClone && (
        <CloneRepoDialog onConfirm={handleClone} onClose={() => setShowClone(false)} />
      )}
    </div>
  );
}
