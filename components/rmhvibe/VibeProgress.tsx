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

import { useEffect, useRef } from 'react';
import { Check, FileCode2, Loader2 } from 'lucide-react';

const FILES_MARKER = '===FILES===';
const FILE_HEADER_RE = /^---\s*file:\s*(.+?)\s*---\s*$/gim;

export type VibeProgressFile = { name: string; bytes: number; done: boolean };
export type VibeProgressState = {
  title: string;
  deps: string[];
  /** 'planning' before the files start; 'writing' once `===FILES===` appears. */
  phase: 'planning' | 'writing';
  files: VibeProgressFile[];
};

/** Parse the partial streamed answer into a progress snapshot. */
export function parseVibeProgress(content: string): VibeProgressState {
  const markerIdx = content.indexOf(FILES_MARKER);
  const head = markerIdx === -1 ? content : content.slice(0, markerIdx);

  const field = (name: string) => {
    const m = head.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
    return m ? m[1].trim() : '';
  };
  const title = field('TITLE');
  const deps = field('DEPS')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  if (markerIdx === -1) {
    return { title, deps, phase: 'planning', files: [] };
  }

  const body = content.slice(markerIdx + FILES_MARKER.length);
  const headers: Array<{ name: string; start: number }> = [];
  FILE_HEADER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_HEADER_RE.exec(body)) !== null) {
    headers.push({ name: m[1].trim().replace(/^\.?\//, ''), start: m.index + m[0].length });
  }

  const files: VibeProgressFile[] = headers.map((h, i) => {
    const end = i + 1 < headers.length ? headers[i + 1].start : body.length;
    return {
      name: h.name,
      bytes: body.slice(h.start, end).trim().length,
      // Every file but the last is fully written; the last is still streaming.
      done: i < headers.length - 1,
    };
  });

  return { title, deps, phase: 'writing', files };
}

function formatBytes(n: number): string {
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function VibeProgress({ content, className = '' }: { content: string; className?: string }) {
  const { title, deps, phase, files } = parseVibeProgress(content);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the newest file in view as the list grows.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [files.length]);

  if (!content.trim()) return null;

  return (
    <div className={`vibe-progress ${className}`.trim()}>
      <div className="vibe-progress__head">
        <span className="vibe-progress__label">
          {phase === 'planning' ? 'Planning the build' : 'Writing code'}
        </span>
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
        <div ref={ref} className="vibe-progress__files">
          {files.map((f) => (
            <div
              key={f.name}
              className={`vibe-progress__file ${f.done ? 'is-done' : 'is-writing'}`}
            >
              <span className="vibe-progress__file-icon" aria-hidden="true">
                {f.done ? (
                  <Check size={13} />
                ) : (
                  <Loader2 size={13} className="animate-spin" />
                )}
              </span>
              <FileCode2 size={13} className="vibe-progress__file-kind" aria-hidden="true" />
              <span className="vibe-progress__file-name">{f.name}</span>
              {f.bytes > 0 && (
                <span className="vibe-progress__file-size">{formatBytes(f.bytes)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
