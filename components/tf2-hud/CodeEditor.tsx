/**
 * Code editor for one text file: KeyValues highlighting, diagnostics, scheme-aware
 * completion, find/replace — wired to the project so every keystroke is live in the
 * preview. Re-mounted per file (`key={path}`).
 */
'use client';

import { autocompletion, completionKeymap, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { lintGutter, linter, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { parseKv } from '@/lib/tf2-hud/kv/parse';
import { kvWalk } from '@/lib/tf2-hud/kv/query';
import { PROPERTY_NAMES, valueCompletions } from '@/lib/tf2-hud/kv/completions';
import { COND_ENVS } from '@/lib/tf2-hud/scheme/cond';
import { EMPTY_SCHEME, parseScheme, type Scheme } from '@/lib/tf2-hud/scheme/scheme';
import { useEditor } from '@/lib/tf2-hud/store';
import { validateFiles } from '@/lib/tf2-hud/validate';

const mark = (cls: string) => Decoration.mark({ class: cls });
const M = {
  key: mark('tok-key'),
  string: mark('tok-string'),
  cond: mark('tok-cond'),
  directive: mark('tok-directive'),
  brace: mark('tok-brace'),
  comment: mark('tok-comment'),
};

function decorate(text: string): DecorationSet {
  const doc = parseKv(text);
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const push = (from: number, to: number, deco: Decoration) => {
    if (to > from) ranges.push({ from, to, deco });
  };
  for (const t of doc.tokens) {
    if (t.type === 'open' || t.type === 'close') push(t.start, t.end, M.brace);
    else if (t.type === 'cond') push(t.start, t.end, M.cond);
    const triviaStart = t.start - t.trivia.length;
    const c = t.trivia.indexOf('//');
    if (c >= 0) {
      for (const m of t.trivia.matchAll(/\/\/[^\r\n]*/g)) {
        push(triviaStart + m.index!, triviaStart + m.index! + m[0].length, M.comment);
      }
    }
  }
  if (doc.trailing.includes('//')) {
    const start = text.length - doc.trailing.length;
    for (const m of doc.trailing.matchAll(/\/\/[^\r\n]*/g)) {
      push(start + m.index!, start + m.index! + m[0].length, M.comment);
    }
  }
  kvWalk(doc, (n) => {
    push(n.key.start, n.key.end, n.key.text.startsWith('#') ? M.directive : M.key);
    if (n.value) push(n.value.start, n.value.end, M.string);
  });
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(ranges.map((r) => r.deco.range(r.from, r.to)));
}

const kvHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view.state.doc.toString());
    }
    update(u: ViewUpdate) {
      if (u.docChanged) this.decorations = decorate(u.state.doc.toString());
    }
  },
  { decorations: (v) => v.decorations },
);

export default function CodeEditor({ path }: { path: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const writeText = useEditor((s) => s.writeText);
  const text = useEditor((s) => {
    void s.baseVersion;
    return s.readText(path);
  });
  const jumpTo = useEditor((s) => s.jumpTo);
  const schemeRef = useRef<Scheme>(EMPTY_SCHEME);
  const schemeText = useEditor((s) => {
    void s.baseVersion;
    return s.readText('resource/clientscheme.res');
  });
  const env = useEditor((s) => s.view.env);

  useEffect(() => {
    schemeRef.current = schemeText ? parseScheme(schemeText, COND_ENVS[env]) : EMPTY_SCHEME;
  }, [schemeText, env]);

  // Build the editor once per file.
  useEffect(() => {
    if (!host.current) return;
    const complete = (ctx: CompletionContext) => {
      const line = ctx.state.doc.lineAt(ctx.pos);
      const before = line.text.slice(0, ctx.pos - line.from);
      const quotes = (before.match(/"/g) ?? []).length;
      const word = ctx.matchBefore(/[\w.$#-]*/);
      if (!ctx.explicit && (!word || (word.from === word.to && quotes % 2 === 0))) return null;
      const insideString = quotes % 2 === 1;
      const completed = Math.floor(quotes / 2);
      const from = insideString ? line.from + before.lastIndexOf('"') + 1 : (word?.from ?? ctx.pos);
      if (completed === 0) {
        return {
          from,
          options: PROPERTY_NAMES.map((label) => ({ label, type: 'property' })),
          validFor: /^[\w.$#-]*$/,
        };
      }
      const key = /"([^"]*)"/.exec(line.text)?.[1] ?? '';
      const values = valueCompletions(key, schemeRef.current);
      return values.length
        ? {
            from,
            options: values.map((label) => ({ label, type: 'constant' })),
            validFor: /^[\w.$#-]*$/,
          }
        : null;
    };

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: useEditor.getState().readText(path) ?? '',
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          search({ top: true }),
          highlightSelectionMatches(),
          autocompletion({ override: [complete] }),
          lintGutter(),
          linter(
            (v): Diagnostic[] => {
              const src = v.state.doc.toString();
              const issues = validateFiles({
                scope: [path],
                readText: () => src,
                size: () => undefined,
                exists: (p) => useEditor.getState().hasFile(p),
                scheme: schemeRef.current,
                env: COND_ENVS[useEditor.getState().view.env],
              });
              return issues
                .filter((i) => i.offset !== undefined && i.severity !== 'info')
                .map((i) => ({
                  from: Math.min(i.offset!, src.length),
                  to: Math.min(i.offset! + 1, src.length),
                  severity: i.severity === 'error' ? 'error' : 'warning',
                  message: i.message,
                }));
            },
            { delay: 400 },
          ),
          kvHighlighter,
          EditorView.lineWrapping,
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) writeText(path, u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ 'aria-label': path }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is rebuilt only when the file changes; text sync is below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // External changes (undo, drag in the preview, inspector) flow into the doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || text === undefined) return;
    const cur = view.state.doc.toString();
    if (cur !== text) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: text } });
    }
  }, [text]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !jumpTo || jumpTo.path !== path) return;
    const pos = Math.min(jumpTo.offset, view.state.doc.length);
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    });
    view.focus();
  }, [jumpTo, path]);

  return <div ref={host} className="tf2hud-cm h-full min-h-0 overflow-hidden" data-gesture="" />;
}
