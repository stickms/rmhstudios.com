'use client';

import { useEffect, useRef, useState, lazy, Suspense } from 'react';
const MonacoEditor = lazy(() => import('@monaco-editor/react'));

// TipTap JSON → Markdown (best-effort)
function tiptapToMarkdown(jsonStr: string): string {
  try {
    const doc = JSON.parse(jsonStr);
    return convertNode(doc).trim();
  } catch {
    return jsonStr;
  }
}

function convertNode(node: Record<string, unknown>, listDepth = 0): string {
  const type = node.type as string;
  const content = (node.content as Array<Record<string, unknown>>) ?? [];
  const attrs = (node.attrs as Record<string, unknown>) ?? {};

  switch (type) {
    case 'doc': return content.map((n) => convertNode(n, listDepth)).join('\n');
    case 'paragraph': return content.map((n) => convertNode(n, listDepth)).join('') + '\n';
    case 'heading': return `${'#'.repeat((attrs.level as number) || 1)} ${content.map((n) => convertNode(n)).join('')}\n`;
    case 'text': {
      let text = node.text as string;
      const marks = (node.marks as Array<Record<string, unknown>>) ?? [];
      for (const mark of marks) {
        const mt = mark.type as string;
        if (mt === 'bold') text = `**${text}**`;
        if (mt === 'italic') text = `*${text}*`;
        if (mt === 'strike') text = `~~${text}~~`;
        if (mt === 'code') text = `\`${text}\``;
      }
      return text;
    }
    case 'hardBreak': return '\n';
    case 'bulletList': return content.map((n) => convertNode(n, listDepth + 1)).join('') + '\n';
    case 'orderedList': {
      let i = (attrs.start as number) ?? 1;
      return content.map((n) => { const r = `${'  '.repeat(listDepth)}${i++}. ${content_of(n)}`; return r; }).join('\n') + '\n';
    }
    case 'listItem': return `${'  '.repeat(Math.max(0, listDepth - 1))}- ${content.map((n) => convertNode(n, 0)).join('').trim()}\n`;
    case 'taskList': return content.map((n) => convertNode(n, listDepth + 1)).join('');
    case 'taskItem': {
      const checked = attrs.checked ? '[x]' : '[ ]';
      return `- ${checked} ${content.map((n) => convertNode(n, 0)).join('').replace(/\n/g, ' ').trim()}\n`;
    }
    case 'blockquote': return content.map((n) => `> ${convertNode(n, listDepth).trim()}`).join('\n') + '\n';
    case 'codeBlock': return `\`\`\`${(attrs.language as string) ?? ''}\n${content.map((n) => convertNode(n)).join('')}\`\`\`\n`;
    case 'horizontalRule': return '---\n';
    case 'image': return `![${(attrs.alt as string) ?? ''}](${attrs.src as string})\n`;
    case 'table': return content.map((n) => convertNode(n)).join('') + '\n';
    case 'tableRow': {
      const cells = content.map((n) => content_of(n).trim()).join(' | ');
      return `| ${cells} |\n`;
    }
    default: return content.map((n) => convertNode(n, listDepth)).join('');
  }
}

function content_of(node: Record<string, unknown>): string {
  const content = (node.content as Array<Record<string, unknown>>) ?? [];
  return content.map((n) => convertNode(n)).join('');
}

// Markdown → TipTap JSON (minimal, for round-tripping)
async function markdownToTiptap(md: string): Promise<string> {
  const { marked } = await import('marked');
  const html = await marked(md);
  // We'll store as a "markdown" doc — just paragraph with html as text for now
  // A full round-trip parser would be complex; we use the HTML approach
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '__MARKDOWN_FALLBACK__' }] }],
    _markdown: md,
    _html: html,
  });
}

interface Props {
  content: string;
  onSave: (content: string) => Promise<void>;
}

export default function MarkdownEditor({ content, onSave }: Props) {
  const [mdValue, setMdValue] = useState(() => tiptapToMarkdown(content));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const el = document.querySelector('.notes-theme');
    setIsDark(el?.classList.contains('dark') ?? false);
    const obs = new MutationObserver(() => {
      setIsDark(el?.classList.contains('dark') ?? false);
    });
    if (el) obs.observe(el, { attributes: true });
    return () => obs.disconnect();
  }, []);

  const handleChange = (val: string | undefined) => {
    const v = val ?? '';
    setMdValue(v);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const tiptap = await markdownToTiptap(v);
      onSave(tiptap);
    }, 2000);
  };

  return (
    <div className="flex-1 h-full" style={{ minHeight: 400 }}>
      <Suspense fallback={null}>
        <MonacoEditor
          height="100%"
          language="markdown"
          value={mdValue}
          onChange={handleChange}
          theme={isDark ? 'vs-dark' : 'vs'}
          options={{
            wordWrap: 'on',
            minimap: { enabled: false },
            lineNumbers: 'off',
            folding: true,
            renderLineHighlight: 'none',
            scrollBeyondLastLine: false,
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            padding: { top: 24, bottom: 24 },
          }}
        />
      </Suspense>
    </div>
  );
}
