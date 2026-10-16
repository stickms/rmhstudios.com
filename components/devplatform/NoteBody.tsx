import { parseNoteBody } from '@/lib/devplatform/release-notes';

/** Renders a release-note body as plain text bullets/paragraphs (never HTML). */
export function NoteBody({ body }: { body: string }) {
  const lines = parseNoteBody(body);
  return (
    <div className="space-y-1 text-sm text-site-text-muted">
      {lines.map((l, i) =>
        l.kind === 'li' ? (
          <p key={i} className="flex gap-2">
            <span aria-hidden>•</span>
            <span>{l.text}</span>
          </p>
        ) : (
          <p key={i}>{l.text}</p>
        ),
      )}
    </div>
  );
}
