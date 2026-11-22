/**
 * VibeProgress — live "what's being built" panel.
 *
 * The model streams its answer (the SLUG/TITLE/DEPS metadata, then the project
 * files) as `content` deltas. Without surfacing them the UI only showed the
 * model's "thinking" and then sat on a spinner through the entire code-writing
 * phase — which felt stuck on anything non-trivial. This parses the partial answer
 * as it streams and shows concrete progress: the page title, the npm deps, and the
 * file list filling in, with the file currently being written marked in-progress.
 *
 * Pure + client-safe: `parseVibeProgress` does only string work, so it's also unit-
 * testable on its own. Mirrors the server-side parse in vibe-bundle.server.ts
 * (`===FILES===` marker, `--- file: <path> ---` headers) — kept deliberately lax so
 * it degrades gracefully on a half-streamed, not-yet-valid response.
 */

import { Check, FileCode2, Loader2 } from 'lucide-react';
import { useStickToBottom } from '@/hooks/useStickToBottom';
import '@/components/rmhvibe/vibe.css';
import { FILES_MARKER, parsePartialProject } from '@/lib/rmhvibe/vibe-project';

export type VibeProgressFile = {
  name: string;
  bytes: number;
  done: boolean;
};
export type VibeProgressState = {
  title: string;
  deps: string[];
  /** 'planning' before the files start; 'writing' once `===FILES===` appears. */
  phase: 'planning' | 'writing';
  files: VibeProgressFile[];
};

/** Parse the partial streamed answer into a progress snapshot. */
export function parseVibeProgress(content: string): VibeProgressState {
  const partial = parsePartialProject(content);
  const deps = Object.entries(partial.deps).map(([name, version]) =>
    version === 'latest' ? name : `${name}@${version}`,
  );
  if (!content.includes(FILES_MARKER)) {
    return {
      title: partial.title ?? '',
      deps,
      phase: 'planning',
      files: [],
    };
  }
  // One row per path: a path the model writes twice is one file in the finished project
  // (the later copy wins), and `files[name]` already holds that copy. The parser's order
  // list can repeat it, which would repeat the React key.
  const names = [...new Set([...partial.done, ...(partial.writing ? [partial.writing] : [])])];
  return {
    title: partial.title ?? '',
    deps,
    phase: 'writing',
    files: names.map((name) => ({
      name,
      bytes: partial.files[name].length,
      done: name !== partial.writing,
    })),
  };
}

function formatBytes(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function VibeProgress({ content, className = '' }: { content: string; className?: string }) {
  const { title, deps, phase, files } = parseVibeProgress(content);
  const { containerRef, contentRef } = useStickToBottom<HTMLDivElement, HTMLDivElement>();

  // `useStickToBottom`, not `scrollTop = scrollHeight` in an effect. The old form
  // had two faults: reading `scrollHeight` FORCES a synchronous layout, here on
  // every streamed token, and it re-pinned unconditionally — so a reader who
  // scrolled up to re-read something was yanked back down by the next token.
  // The hook records the pin decision on `scroll` (before the content grows) and
  // re-pins from a ResizeObserver. See docs/archive/2026/performance-audit-2026-08-12.md §1.5.

  if (!content.trim()) return null;

  return (
    <div className={`vibe-progress ${className}`.trim()}>
      <div className="vibe-progress__head">
        <span className="vibe-progress__label">{phase === 'planning' ? 'Planning the build' : 'Writing code'}</span>
        {title && <span className="vibe-progress__title">{title}</span>}
      </div>

      {deps.length > 0 && (
        <div className="vibe-progress__deps">
          {deps.map((d) => (
            <span key={d} className="vibe-progress__dep">
              {d}
            </span>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div ref={containerRef} className="vibe-progress__files">
          <div ref={contentRef}>
            {files.map((f) => (
              <div key={f.name} className={`vibe-progress__file ${f.done ? 'is-done' : 'is-writing'}`}>
                <span className="vibe-progress__file-icon" aria-hidden="true">
                  {f.done ? <Check size={13} /> : <Loader2 size={13} className="animate-spin" />}
                </span>
                <FileCode2 size={13} className="vibe-progress__file-kind" aria-hidden="true" />
                <span className="vibe-progress__file-name">{f.name}</span>
                {f.bytes > 0 && <span className="vibe-progress__file-size">{formatBytes(f.bytes)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
