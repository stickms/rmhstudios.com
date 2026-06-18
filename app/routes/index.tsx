/**
 * Homepage — RMHVibe landing.
 *
 * A minimal, centered prompt experience: enter anything, and we generate a
 * shareable, customizable vibe page. No auth required. Rendered as a flat route
 * (outside the _site sidebar layout) for a full-bleed black/white experience.
 */

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { ModelSelect } from '@/components/rmhvibe/ModelSelect';
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

  // Auto-focus the prompt on mobile after mount.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      inputRef.current?.focus();
    }
  }, []);

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

        <p className="vibe-rise-3 vibe-hint my-10">Type anything, and we&apos;ll build it.</p>

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

        <Link to="/v" className="vibe-ghost-link vibe-rise-soft mt-8">
          Browse pages →
        </Link>
      </div>
    </main>
  );
}
