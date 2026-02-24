'use client';

import { useEffect, useState, useCallback } from 'react';
import { useDocsStore } from '@/lib/store/useDocsStore';
import { authClient } from '@/lib/auth-client';
import dynamic from 'next/dynamic';
import type { DocsDocument } from './types';
import { DOCS_ACCENT } from './types';

import DocsHome from './DocsHome';

const DocsEditor = dynamic(() => import('./DocsEditor'), { ssr: false });

export default function DocsApp() {
  const { darkMode } = useDocsStore();

  const [systemDark, setSystemDark] = useState(false);
  const effectiveDark = darkMode === null ? systemDark : darkMode;

  const [documents, setDocuments] = useState<DocsDocument[]>([]);
  const [currentDoc, setCurrentDoc] = useState<DocsDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  // System dark mode detection
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Check auth
  useEffect(() => {
    authClient.getSession().then((res) => {
      if (res.data?.session) setAuthed(true);
      else setAuthed(false);
    }).catch(() => setAuthed(false));
  }, []);

  // Load documents
  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rmh-utils/documents?type=DOC');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadDocuments();
  }, [authed, loadDocuments]);

  // CRUD operations
  const createDocument = useCallback(async () => {
    const res = await fetch('/api/rmh-utils/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'DOC', title: 'Untitled Document' }),
    });
    if (res.ok) {
      const { document } = await res.json();
      setDocuments((prev) => [document, ...prev]);
      setCurrentDoc(document);
    }
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
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

  const favoriteDocument = useCallback(async (id: string, isFavorite: boolean) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite }),
    });
    if (res.ok) {
      const { document } = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === id ? document : d)));
      if (currentDoc?.id === id) setCurrentDoc(document);
    }
  }, [currentDoc]);

  const renameDocument = useCallback(async (id: string, title: string) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const { document } = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === id ? document : d)));
      if (currentDoc?.id === id) setCurrentDoc(document);
    }
  }, [currentDoc]);

  const handleBack = useCallback(() => {
    setCurrentDoc(null);
    loadDocuments();
  }, [loadDocuments]);

  // Auth gate
  if (authed === null) {
    return (
      <div className="docs-theme flex items-center justify-center h-screen" style={{ background: 'var(--docs-bg)' }}>
        <div className="flex items-center gap-3" style={{ color: 'var(--docs-text-muted)' }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="docs-theme flex items-center justify-center h-screen" style={{ background: 'var(--docs-bg)', color: 'var(--docs-text)' }}>
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: `${DOCS_ACCENT}22` }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={DOCS_ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold">RMH Docs</h1>
          <p style={{ color: 'var(--docs-text-muted)' }}>Please sign in to access your documents.</p>
          <a
            href="/login"
            className="inline-block px-5 py-2.5 rounded-lg font-semibold text-sm"
            style={{ background: DOCS_ACCENT, color: '#fff' }}
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`docs-theme${effectiveDark ? ' dark' : ''} flex flex-col h-screen overflow-hidden`}
      style={{ background: 'var(--docs-bg)', color: 'var(--docs-text)', fontFamily: 'var(--docs-font)' }}
    >
      {currentDoc ? (
        <DocsEditor
          document={currentDoc}
          onBack={handleBack}
          onRename={(title) => renameDocument(currentDoc.id, title)}
          onToggleFavorite={() => favoriteDocument(currentDoc.id, !currentDoc.isFavorite)}
        />
      ) : (
        <DocsHome
          documents={documents}
          loading={loading}
          onCreate={createDocument}
          onOpen={setCurrentDoc}
          onDelete={deleteDocument}
          onFavorite={favoriteDocument}
          onRename={renameDocument}
        />
      )}
    </div>
  );
}
