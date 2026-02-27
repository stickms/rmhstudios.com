'use client';

import { useState } from 'react';
import { useNotesDataStore } from '@/lib/store/useNotesDataStore';
import { NoteVersion } from './types';
import Modal from './Modal';

interface Props {
  noteId: string;
  onRestore: (versionId: string) => void;
  onClose: () => void;
}

export default function VersionHistoryPanel({ noteId, onRestore, onClose }: Props) {
  const versions = useNotesDataStore((s) => s.getVersions)(noteId);
  const [preview, setPreview] = useState<string | null>(null);

  const getPreview = (content: string) => {
    try {
      const doc = JSON.parse(content);
      const texts: string[] = [];
      const extract = (nodes: Array<Record<string, unknown>>) => {
        for (const n of nodes) {
          if (n.type === 'text') texts.push(n.text as string);
          if (n.content) extract(n.content as Array<Record<string, unknown>>);
          if (texts.join('').length > 300) return;
        }
      };
      if (doc.content) extract(doc.content);
      return texts.join('').slice(0, 300);
    } catch { return content.slice(0, 300); }
  };

  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days} days ago` : new Date(iso).toLocaleDateString();
  };

  return (
    <Modal title="🕐 Version History" onClose={onClose} wide>
      {versions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm" style={{ color: 'var(--notes-text-muted)' }}>No versions saved yet. Versions are saved automatically when you edit.</p>
        </div>
      ) : (
        <div className="flex gap-4" style={{ minHeight: 300 }}>
          {/* Version list */}
          <div className="w-48 shrink-0 space-y-1 overflow-y-auto pr-2">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setPreview(v.id)}
                className="w-full text-left p-2.5 rounded-lg transition-colors"
                style={{
                  background: preview === v.id ? 'var(--notes-surface-2)' : 'transparent',
                  border: `1px solid ${preview === v.id ? 'var(--notes-border-hover)' : 'transparent'}`,
                  color: 'var(--notes-text-muted)',
                }}
              >
                <p className="text-xs font-medium" style={{ color: 'var(--notes-text)' }}>{relativeTime(v.createdAt)}</p>
                <p className="text-xs mt-0.5 truncate">{v.title}</p>
              </button>
            ))}
          </div>
          {/* Preview */}
          <div className="flex-1 min-w-0">
            {preview ? (
              (() => {
                const v = versions.find((x) => x.id === preview)!;
                return (
                  <div className="h-full flex flex-col gap-3">
                    <div className="flex-1 p-4 rounded-xl overflow-y-auto text-sm" style={{ background: 'var(--notes-surface-2)', color: 'var(--notes-text-muted)', whiteSpace: 'pre-wrap' }}>
                      <strong style={{ color: 'var(--notes-text)' }}>{v.title}</strong>
                      <br /><br />
                      {getPreview(v.content)}
                      {getPreview(v.content).length >= 300 && '...'}
                    </div>
                    <button
                      onClick={() => onRestore(v.id)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold self-end"
                      style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
                    >
                      Restore this version
                    </button>
                  </div>
                );
              })()
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--notes-text-subtle)' }}>
                <p className="text-sm">Select a version to preview</p>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
