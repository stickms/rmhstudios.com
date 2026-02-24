'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { DocumentInfo } from '@/lib/rmh-utils/types';
import SheetsHome from './SheetsHome';

const SheetsEditor = dynamic(() => import('./SheetsEditor'), { ssr: false });

const ACCENT = '#10b981';
const ACCENT_HOVER = '#0ea572';

export default function SheetsApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<{ id: string; name: string | null; image: string | null } | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDoc, setCurrentDoc] = useState<DocumentInfo | null>(null);

  // Check auth
  useEffect(() => {
    fetch('/api/rmh-utils/documents?type=SHEET')
      .then(async (r) => {
        if (r.status === 401) {
          setAuthed(false);
        } else {
          setAuthed(true);
          const data = await r.json();
          setDocuments(data.documents || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setAuthed(false);
        setLoading(false);
      });
  }, []);

  // Get current user session
  useEffect(() => {
    fetch('/api/auth/get-session')
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (data?.user) {
            setUser({ id: data.user.id, name: data.user.name, image: data.user.image });
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rmh-utils/documents?type=SHEET');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreate = useCallback(async () => {
    const res = await fetch('/api/rmh-utils/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SHEET', title: 'Untitled Spreadsheet' }),
    });
    if (res.ok) {
      const { document } = await res.json();
      setDocuments((prev) => [document, ...prev]);
      setCurrentDoc(document);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDeleted: true }),
    });
    if (res.ok) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (currentDoc?.id === id) setCurrentDoc(null);
    }
  }, [currentDoc]);

  const handleFavorite = useCallback(async (id: string, fav: boolean) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: fav }),
    });
    if (res.ok) {
      const { document } = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === document.id ? document : d)));
      if (currentDoc?.id === id) setCurrentDoc(document);
    }
  }, [currentDoc]);

  const handleRename = useCallback(async (id: string, title: string) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const { document } = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === document.id ? document : d)));
      if (currentDoc?.id === id) setCurrentDoc(document);
    }
  }, [currentDoc]);

  const handleBack = useCallback(() => {
    setCurrentDoc(null);
    loadDocuments();
  }, [loadDocuments]);

  // Auth gate
  if (authed === false) {
    return (
      <div className="sheets-theme flex items-center justify-center h-screen" style={{ background: 'var(--sheets-bg)', color: 'var(--sheets-text)' }}>
        <div className="text-center space-y-4">
          <div className="text-5xl">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">RMH Sheets</h1>
          <p style={{ color: 'var(--sheets-text-muted)' }}>Please sign in to access your spreadsheets.</p>
          <a href="/login" className="inline-block px-5 py-2.5 rounded-lg font-semibold text-sm text-white" style={{ background: ACCENT }}>
            Sign in
          </a>
        </div>
      </div>
    );
  }

  // Loading
  if (authed === null || loading) {
    return (
      <div className="sheets-theme flex items-center justify-center h-screen" style={{ background: 'var(--sheets-bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
          <span style={{ color: 'var(--sheets-text-muted)' }} className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Editor view
  if (currentDoc && user) {
    return (
      <div className="sheets-theme h-screen flex flex-col" style={{ background: 'var(--sheets-bg)', color: 'var(--sheets-text)' }}>
        <SheetsEditor
          document={currentDoc}
          user={user}
          onBack={handleBack}
          onRename={(title) => handleRename(currentDoc.id, title)}
          onToggleFavorite={() => handleFavorite(currentDoc.id, !currentDoc.isFavorite)}
        />
      </div>
    );
  }

  // Home view
  return (
    <div className="sheets-theme h-screen flex flex-col" style={{ background: 'var(--sheets-bg)', color: 'var(--sheets-text)' }}>
      <SheetsHome
        documents={documents}
        onOpen={setCurrentDoc}
        onCreate={handleCreate}
        onDelete={handleDelete}
        onFavorite={handleFavorite}
        onRename={handleRename}
      />
    </div>
  );
}
