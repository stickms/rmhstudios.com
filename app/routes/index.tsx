/**
 * Homepage — RMHVibe landing.
 *
 * A minimal, centered prompt experience: enter anything, and we generate a
 * shareable, customizable vibe page. No auth required. Rendered as a flat route
 * (outside the _site sidebar layout) for a full-bleed black/white experience.
 */

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { ArrowRight, LogOut, User } from 'lucide-react';
import { ModelSelect } from '@/components/rmhvibe/ModelSelect';
import { authClient } from '@/lib/auth-client';
import { DEFAULT_VIBE_MODEL, type VibeModel } from '@/lib/rmhvibe/vibe-types';
import '@/components/rmhvibe/vibe.css';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'RMH Studios — The anything platform.' },
      {
        name: 'description',
        content: 'Type a prompt and get an instant, shareable, collaboratively-editable webpage.',
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [model, setModel] = useState<VibeModel>(DEFAULT_VIBE_MODEL);

  const { data: session, isPending } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const authRef = useRef<HTMLDivElement>(null);

  // Auto-focus the prompt on mobile after mount.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      inputRef.current?.focus();
    }
  }, []);

  // Close the account menu on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (authRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          setMenuOpen(false);
          window.location.reload();
        },
      },
    });
  }

  function submit() {
    const prompt = inputRef.current?.value.trim();
    if (!prompt) return;
    navigate({ to: '/v/new', search: { prompt, model } });
  }

  // Enter submits; Shift+Enter inserts a newline.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <main className="vibe-screen fixed inset-0 flex flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full flex-col items-center text-center">
        <p className="vibe-rise vibe-presents mb-3">RMH Studios presents</p>
        <h1 className="vibe-rise-2 vibe-title">The anything platform.</h1>

        <div className="vibe-account-row vibe-rise-3 my-10 flex justify-center">
          {isPending ? (
            // Reserve the line's vertical space while the session resolves.
            <span className="vibe-hint opacity-0" aria-hidden>
              &nbsp;
            </span>
          ) : session?.user ? (
            <div ref={authRef} className="vibe-account">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="vibe-hint vibe-account__trigger"
              >
                Welcome back, {session.user.name || 'friend'}.
              </button>
              {menuOpen && (
                <div role="menu" className="vibe-account__menu">
                  <div className="vibe-account__header">
                    <img
                      src={session.user.image || '/images/social/default_avatar.png'}
                      alt={session.user.name || 'You'}
                      className="vibe-account__avatar"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
                      }}
                    />
                    <div className="vibe-account__id">
                      <span className="vibe-account__name">{session.user.name || 'friend'}</span>
                      <span className="vibe-account__handle">
                        @{(session.user as { handle?: string }).handle || session.user.id}
                      </span>
                    </div>
                  </div>
                  <div className="vibe-account__sep" />
                  <Link
                    to="/u/$userid"
                    params={{ userid: (session.user as { handle?: string }).handle || session.user.id }}
                    role="menuitem"
                    className="vibe-account__item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <User size={15} />
                    <span>View profile</span>
                  </Link>
                  <button type="button" role="menuitem" onClick={handleSignOut} className="vibe-account__item">
                    <LogOut size={15} />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" search={{ callbackURL: '/' }} className="vibe-hint vibe-account__trigger">
              Log in
            </Link>
          )}
        </div>

        <div className="flex w-full justify-center">
          <div className="vibe-dock vibe-dock--area vibe-rise-soft">
            <textarea
              ref={inputRef}
              name="prompt"
              rows={3}
              autoComplete="off"
              onKeyDown={handleKeyDown}
              placeholder="Where do you want to go?"
              aria-label="Describe the page you want to create"
              className="vibe-dock__textarea"
            />
            <div className="vibe-dock__footer">
              <ModelSelect value={model} onChange={setModel} />
              <button type="button" onClick={submit} aria-label="Generate" className="vibe-dock__submit">
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="vibe-rise-soft mt-8 flex flex-col items-center gap-2">
          <Link to="/v" className="vibe-ghost-link">
            Browse pages →
          </Link>
          <Link to="/home" className="vibe-ghost-link">
            Feed →
          </Link>
          <Link to="/builds" className="vibe-ghost-link">
            Builds →
          </Link>
          <Link to="/library" className="vibe-ghost-link">
            Library →
          </Link>
        </div>
      </div>
    </main>
  );
}
