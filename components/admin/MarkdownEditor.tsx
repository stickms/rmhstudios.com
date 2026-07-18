import { useEffect, useRef } from 'react';
import { EditorView, keymap, drawSelection, highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { cn } from '@/lib/utils';

/**
 * Minimal CodeMirror 6 markdown editor for the admin content tools. Replaces the
 * ~13 MB monaco-editor (a full IDE) with only the CodeMirror packages a markdown
 * field actually needs — editing, markdown syntax highlighting, line wrapping,
 * undo/redo — themed with the site's `--site-*` tokens so it follows the active
 * theme. Client-only (the EditorView is created in an effect); SSR renders the
 * empty host div.
 */
const editorTheme = EditorView.theme(
  {
    '&': { color: 'var(--site-text)', backgroundColor: 'transparent', height: '100%' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: '13px',
      lineHeight: '1.65',
    },
    '.cm-content': { caretColor: 'var(--site-accent)', padding: '12px 14px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--site-accent)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in oklab, var(--site-accent) 30%, transparent)',
    },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--site-text) 4%, transparent)' },
    '.cm-placeholder': { color: 'var(--site-text-dim)' },
  },
  { dark: true },
);

export function MarkdownEditor({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Keep onChange current without recreating the editor on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: value,
      parent: hostRef.current,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        editorTheme,
        ...(placeholder ? [cmPlaceholder(placeholder)] : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Created once; external value changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. a file upload replacing the whole doc)
  // into the editor — but only when it genuinely differs, so it never clobbers
  // the cursor while the user is typing (that path round-trips through onChange).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return <div ref={hostRef} className={cn('h-full w-full overflow-hidden', className)} />;
}
