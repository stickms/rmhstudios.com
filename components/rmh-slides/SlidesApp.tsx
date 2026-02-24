'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { authClient } from '@/lib/auth-client';
import type { DocumentInfo, CollaboratorRole } from '@/lib/rmh-utils/types';

const SlidesHome = dynamic(() => import('./SlidesHome'), { ssr: false });
const SlidesEditor = dynamic(() => import('./SlidesEditor'), { ssr: false });

interface UserInfo {
  id: string;
  name: string | null;
  image: string | null;
}

export default function SlidesApp() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [sessionToken, setSessionToken] = useState('');
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Check auth and get session token
  useEffect(() => {
    authClient.getSession().then((res) => {
      if (res.data?.session) {
        setUser({ id: res.data.user.id, name: res.data.user.name ?? null, image: res.data.user.image ?? null });
        if (res.data.session.token) setSessionToken(res.data.session.token);
        setAuthed(true);
        // Load documents
        fetch('/api/rmh-utils/documents?type=SLIDE')
          .then(async (r) => {
            const data = await r.json();
            setDocuments(data.documents || []);
            setLoading(false);
          })
          .catch(() => setLoading(false));
      } else {
        setAuthed(false);
        setLoading(false);
      }
    }).catch(() => {
      setAuthed(false);
      setLoading(false);
      });
  }, []);

  // Fetch user info
  useEffect(() => {
    if (!authed) return;
    fetch('/api/auth/get-session')
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (data?.user) setUser(data.user);
        }
      })
      .catch(() => {});
  }, [authed]);

  const loadDocuments = useCallback(async () => {
    const res = await fetch('/api/rmh-utils/documents?type=SLIDE');
    if (res.ok) {
      const data = await res.json();
      setDocuments(data.documents || []);
    }
  }, []);

  const createDocument = useCallback(async () => {
    const res = await fetch('/api/rmh-utils/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SLIDE', title: 'Untitled Presentation' }),
    });
    if (res.ok) {
      const data = await res.json();
      setDocuments((prev) => [data.document, ...prev]);
      setActiveDoc(data.document);
    }
  }, []);

  const deleteDocument = useCallback(async (id: string) => {
    await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDeleted: true }),
    });
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (activeDoc?.id === id) setActiveDoc(null);
  }, [activeDoc]);

  const favoriteDocument = useCallback(async (id: string, fav: boolean) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: fav }),
    });
    if (res.ok) {
      const data = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === id ? data.document : d)));
    }
  }, []);

  const renameDocument = useCallback(async (id: string, title: string) => {
    const res = await fetch(`/api/rmh-utils/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const data = await res.json();
      setDocuments((prev) => prev.map((d) => (d.id === id ? data.document : d)));
      if (activeDoc?.id === id) setActiveDoc(data.document);
    }
  }, [activeDoc]);

  const addCollaborator = useCallback(async (username: string, role: CollaboratorRole): Promise<boolean> => {
    if (!activeDoc) return false;
    const res = await fetch(`/api/rmh-utils/documents/${activeDoc.id}/collaborators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, role }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveDoc((prev) => prev ? { ...prev, collaborators: data.collaborators } : null);
      return true;
    }
    return false;
  }, [activeDoc]);

  const removeCollaborator = useCallback(async (userId: string) => {
    if (!activeDoc) return;
    await fetch(`/api/rmh-utils/documents/${activeDoc.id}/collaborators`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    setActiveDoc((prev) =>
      prev ? { ...prev, collaborators: prev.collaborators.filter((c) => c.userId !== userId) } : null
    );
  }, [activeDoc]);

  if (authed === null || loading) {
    return (
      <div className="slides-theme flex items-center justify-center h-screen" style={{ background: 'var(--slides-bg)', color: 'var(--slides-text)' }}>
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p style={{ color: 'var(--slides-text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (authed === false) {
    return (
      <div className="slides-theme flex items-center justify-center h-screen" style={{ background: 'var(--slides-bg)', color: 'var(--slides-text)' }}>
        <div className="text-center space-y-4">
          <div className="text-5xl">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>
          </div>
          <h1 className="text-2xl font-bold">RMH Slides</h1>
          <p style={{ color: 'var(--slides-text-muted)' }}>Please sign in to access your presentations.</p>
          <a
            href="/login"
            className="inline-block px-5 py-2.5 rounded-lg font-semibold text-sm text-white"
            style={{ background: 'var(--slides-accent)' }}
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }

  if (activeDoc && user) {
    return (
      <SlidesEditor
        document={activeDoc}
        user={user}
        sessionToken={sessionToken}
        onBack={() => { setActiveDoc(null); loadDocuments(); }}
        onRename={(title) => renameDocument(activeDoc.id, title)}
        onToggleFavorite={() => favoriteDocument(activeDoc.id, !activeDoc.isFavorite)}
        onAddCollaborator={addCollaborator}
        onRemoveCollaborator={removeCollaborator}
      />
    );
  }

  return (
    <SlidesHome
      documents={documents}
      onOpen={setActiveDoc}
      onCreate={createDocument}
      onDelete={deleteDocument}
      onFavorite={favoriteDocument}
      onRename={renameDocument}
    />
  );
}
