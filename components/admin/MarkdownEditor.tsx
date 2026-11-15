import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
} from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from '@codemirror/language';
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
const editorTheme =
  EditorView.theme(
    {
      '&': {
        color:
          'var(--site-text)',
        backgroundColor:
          'transparent',
        height:
          '100%',
      },
      '.cm-scroller':
        {
          overflow:
            'auto',
          // Was a hand-rolled mono stack; the site already ships one (audit: keep
          // every font on the token contract so a theme change reaches everything).
          fontFamily:
            'var(--site-font-mono)',
          fontSize:
            '13px',
          lineHeight:
            '1.65',
        },
      '.cm-content':
        {
          caretColor:
            'var(--site-accent)',
          padding:
            '12px 14px',
        },
      '&.cm-focused':
        {
          outline:
            'none',
        },
      '.cm-cursor, .cm-dropCursor':
        {
          borderLeftColor:
            'var(--site-accent)',
        },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        {
          backgroundColor:
            'color-mix(in oklab, var(--site-accent) 30%, transparent)',
        },
      '.cm-activeLine':
        {
          backgroundColor:
            'color-mix(in oklab, var(--site-text) 4%, transparent)',
        },
      '.cm-placeholder':
        {
          color:
            'var(--site-text-muted)',
        },
    },
    {
      dark: true,
    },
  );

/** What a parent can do to the editor's document without owning its state. */
export interface MarkdownEditorHandle {
  /**
   * Replaces the main selection with `text`, puts the caret after it and focuses the editor.
   * With `ownLine`, a newline is added before and/or after `text` only where the neighbouring
   * characters are not already line breaks, so the text sits on a line of its own.
   * Returns false when the editor view does not exist yet (before mount, after unmount).
   */
  insertAtCursor: (
    text: string,
    options?: {
      ownLine?: boolean;
    },
  ) => boolean;
}

export const MarkdownEditor =
  forwardRef<
    MarkdownEditorHandle,
    {
      value: string;
      onChange: (
        value: string,
      ) => void;
      className?: string;
      placeholder?: string;
    }
  >(
    function MarkdownEditor(
      {
        value,
        onChange,
        className,
        placeholder,
      },
      ref,
    ) {
      const hostRef =
        useRef<HTMLDivElement>(
          null,
        );
      const viewRef =
        useRef<EditorView | null>(
          null,
        );
      // Keep onChange current without recreating the editor on every render.
      const onChangeRef =
        useRef(
          onChange,
        );
      onChangeRef.current =
        onChange;

      useImperativeHandle(
        ref,
        () => ({
          insertAtCursor:
            (
              text: string,
              options?: {
                ownLine?: boolean;
              },
            ) => {
              const view =
                viewRef.current;
              if (
                !view
              )
                return false;
              const {
                from,
                to,
              } =
                view
                  .state
                  .selection
                  .main;
              const doc =
                view
                  .state
                  .doc;
              const lead =
                options?.ownLine &&
                from >
                  0 &&
                doc.sliceString(
                  from -
                    1,
                  from,
                ) !==
                  '\n'
                  ? '\n'
                  : '';
              const trail =
                options?.ownLine &&
                doc.sliceString(
                  to,
                  to +
                    1,
                ) !==
                  '\n'
                  ? '\n'
                  : '';
              const insert = `${lead}${text}${trail}`;
              view.dispatch(
                {
                  changes:
                    {
                      from,
                      to,
                      insert,
                    },
                  selection:
                    {
                      anchor:
                        from +
                        insert.length,
                    },
                  scrollIntoView: true,
                  userEvent:
                    'input.paste',
                },
              );
              view.focus();
              return true;
            },
        }),
      );

      useEffect(() => {
        if (
          !hostRef.current
        )
          return;
        const view =
          new EditorView(
            {
              doc: value,
              parent:
                hostRef.current,
              extensions:
                [
                  history(),
                  drawSelection(),
                  highlightActiveLine(),
                  keymap.of(
                    [
                      ...defaultKeymap,
                      ...historyKeymap,
                    ],
                  ),
                  markdown(),
                  EditorView.lineWrapping,
                  syntaxHighlighting(
                    defaultHighlightStyle,
                    {
                      fallback: true,
                    },
                  ),
                  editorTheme,
                  ...(placeholder
                    ? [
                        cmPlaceholder(
                          placeholder,
                        ),
                      ]
                    : []),
                  EditorView.updateListener.of(
                    (
                      u,
                    ) => {
                      if (
                        u.docChanged
                      )
                        onChangeRef.current(
                          u.state.doc.toString(),
                        );
                    },
                  ),
                ],
            },
          );
        viewRef.current =
          view;
        return () => {
          view.destroy();
          viewRef.current =
            null;
        };
        // Created once; external value changes are synced by the effect below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      // Sync external value changes (e.g. a file upload replacing the whole doc)
      // into the editor — but only when it genuinely differs, so it never clobbers
      // the cursor while the user is typing (that path round-trips through onChange).
      useEffect(() => {
        const view =
          viewRef.current;
        if (
          !view
        )
          return;
        const current =
          view.state.doc.toString();
        if (
          value !==
          current
        ) {
          view.dispatch(
            {
              changes:
                {
                  from: 0,
                  to: current.length,
                  insert:
                    value,
                },
            },
          );
        }
      }, [
        value,
      ]);

      return (
        <div
          ref={
            hostRef
          }
          className={cn(
            'h-full w-full overflow-hidden',
            className,
          )}
        />
      );
    },
  );
