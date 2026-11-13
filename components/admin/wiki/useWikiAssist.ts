import { useEffect, useRef, useState } from 'react';
import { streamWikiAssist, WikiAssistError } from '@/lib/wiki/assist-stream';

/** Why a run ended without a usable draft; the editor turns it into a toast. */
export type WikiAssistFailure = 'empty' | 'offline' | 'rate-limited' | 'failed';

/**
 * The writing assistant's state for one editor: streams DeepSeek's page into
 * `setContent`, remembers the body from before the run so it can be undone, and
 * stops the stream when the editor closes.
 */
export function useWikiAssist({
  content,
  setContent,
  onFailure,
}: {
  content: string;
  setContent: (next: string) => void;
  onFailure: (why: WikiAssistFailure) => void;
}) {
  const [writing, setWriting] = useState(false);
  /** The body as it was before the assistant last wrote. */
  const [before, setBefore] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const write = async (instruction: string, title: string) => {
    const original = content;
    const controller = new AbortController();
    abort.current = controller;
    setWriting(true);
    setBefore(original);
    let text = '';
    const restore = () => {
      setContent(original);
      setBefore(null);
    };
    try {
      await streamWikiAssist(
        { instruction, title, content: original },
        (delta) => {
          text += delta;
          setContent(text);
        },
        controller.signal,
      );
      if (!text.trim()) {
        restore();
        onFailure('empty');
      }
    } catch (err) {
      // A stop is the admin's choice: keep what was written, Undo still works.
      if (controller.signal.aborted) return;
      if (!text.trim()) restore();
      const code = err instanceof WikiAssistError ? err.code : '';
      onFailure(
        code === 'AI_UNAVAILABLE'
          ? 'offline'
          : code === 'RATE_LIMITED' || code === 'http_429'
            ? 'rate-limited'
            : 'failed',
      );
    } finally {
      setWriting(false);
      abort.current = null;
    }
  };

  return {
    writing,
    canUndo: before !== null && !writing,
    write,
    stop: () => abort.current?.abort(),
    undo: () => {
      if (before === null) return;
      setContent(before);
      setBefore(null);
    },
  };
}
