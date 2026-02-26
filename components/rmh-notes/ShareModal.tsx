'use client';

import { useEffect, useState } from 'react';
import { Note } from './types';
import { toast } from 'sonner';
import Modal from './Modal';

interface Props {
  note: Note;
  onClose: () => void;
}

export default function ShareModal({ note, onClose }: Props) {
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/rmh-notes/notes/${note.id}/share`)
      .then((r) => r.json())
      .then((d) => { setShareToken(d.share?.token ?? null); })
      .finally(() => setLoading(false));
  }, [note.id]);

  const shareUrl = shareToken ? `${window.location.origin}/rmh-notes/share/${shareToken}` : null;

  const createLink = async () => {
    setCreating(true);
    const res = await fetch(`/api/rmh-notes/notes/${note.id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    setCreating(false);
    if (res.ok) { const d = await res.json(); setShareToken(d.share.token); toast.success('Share link created'); }
  };

  const revokeLink = async () => {
    if (!confirm('Revoke this share link? Anyone with the link will lose access.')) return;
    const res = await fetch(`/api/rmh-notes/notes/${note.id}/share`, { method: 'DELETE' });
    if (res.ok) { setShareToken(null); toast.success('Share link revoked'); }
  };

  const copyLink = () => {
    if (shareUrl) { navigator.clipboard.writeText(shareUrl); toast.success('Link copied!'); }
  };

  return (
    <Modal title="🔗 Share Note" onClose={onClose}>
      {loading ? (
        <div className="text-center py-6" style={{ color: 'var(--notes-text-muted)' }}>Loading...</div>
      ) : shareToken ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>Anyone with this link can view your note (read-only).</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl!}
              className="flex-1 px-3 py-2 rounded-lg text-xs outline-none select-all"
              style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)', color: 'var(--notes-text-muted)' }}
              onFocus={(e) => e.target.select()}
            />
            <button onClick={copyLink} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
              Copy
            </button>
          </div>
          <div className="flex justify-between items-center pt-2">
            <p className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>Note: locked notes are not shareable.</p>
            <button onClick={revokeLink} className="text-sm px-3 py-1.5 rounded-lg" style={{ color: 'var(--notes-danger)', border: '1px solid var(--notes-danger)' }}>
              Revoke Link
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center space-y-4 py-4">
          <p className="text-4xl">🔗</p>
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>Create a public read-only link to share this note.</p>
          <button onClick={createLink} disabled={creating} className="px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}>
            {creating ? 'Creating...' : 'Create Share Link'}
          </button>
        </div>
      )}
    </Modal>
  );
}
