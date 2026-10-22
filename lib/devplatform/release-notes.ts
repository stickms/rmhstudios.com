export interface ReleaseNoteView {
  id: string;
  version: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
}

/** Split a plain-text note body into bullets and paragraphs (no HTML is ever rendered). */
export function parseNoteBody(body: string): { kind: 'li' | 'p'; text: string }[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      /^[-*•]\s+/.test(l)
        ? { kind: 'li' as const, text: l.replace(/^[-*•]\s+/, '') }
        : { kind: 'p' as const, text: l.replace(/^#+\s*/, '') },
    );
}
