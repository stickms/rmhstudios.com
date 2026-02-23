'use client';

import { useState } from 'react';
import { Note } from './types';
import { toast } from 'sonner';
import Modal from './Modal';
import TurndownService from 'turndown';

interface Props {
  note: Note;
  editorHtml: string;
  onClose: () => void;
}

export default function ExportModal({ note, editorHtml, onClose }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const toMarkdown = () => {
    const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
    return `# ${note.title}\n\n${td.turndown(editorHtml)}`;
  };

  const toHTML = () =>
    `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>${note.title}</title></head>\n<body>\n<h1>${note.title}</h1>\n${editorHtml}\n</body>\n</html>`;

  const toText = () => {
    const tmp = document.createElement('div');
    tmp.innerHTML = editorHtml;
    return `${note.title}\n${'='.repeat(note.title.length)}\n\n${tmp.textContent ?? ''}`;
  };

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported as ${filename}`);
  };

  const copy = async (content: string, format: string) => {
    await navigator.clipboard.writeText(content);
    setCopied(format);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Copied to clipboard!');
  };

  const safeName = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note';

  const formats = [
    {
      id: 'markdown',
      label: '📝 Markdown',
      ext: '.md',
      description: 'GitHub-flavored Markdown',
      get: toMarkdown,
      mime: 'text/markdown',
    },
    {
      id: 'html',
      label: '🌐 HTML',
      ext: '.html',
      description: 'Standalone HTML file',
      get: toHTML,
      mime: 'text/html',
    },
    {
      id: 'text',
      label: '📄 Plain Text',
      ext: '.txt',
      description: 'Plain text (no formatting)',
      get: toText,
      mime: 'text/plain',
    },
  ];

  return (
    <Modal title="⬇️ Export Note" onClose={onClose}>
      <div className="space-y-3">
        {formats.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{ background: 'var(--notes-surface-2)', border: '1px solid var(--notes-border)' }}
          >
            <div className="flex-1">
              <p className="font-semibold text-sm" style={{ color: 'var(--notes-text)' }}>{f.label}</p>
              <p className="text-xs" style={{ color: 'var(--notes-text-muted)' }}>{f.description}</p>
            </div>
            <button
              onClick={() => copy(f.get(), f.id)}
              className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: 'var(--notes-surface-3)', color: 'var(--notes-text-muted)', border: '1px solid var(--notes-border)' }}
            >
              {copied === f.id ? '✓ Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => download(f.get(), `${safeName}${f.ext}`, f.mime)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
              style={{ background: 'var(--notes-accent)', color: 'var(--notes-accent-fg)' }}
            >
              Download
            </button>
          </div>
        ))}

        <div className="pt-2" style={{ borderTop: '1px solid var(--notes-border)' }}>
          <p className="text-xs" style={{ color: 'var(--notes-text-subtle)' }}>
            💡 PDF export is available via your browser&apos;s Print function (⌘P → Save as PDF).
          </p>
        </div>
      </div>
    </Modal>
  );
}
