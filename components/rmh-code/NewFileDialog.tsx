'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface FileTemplate {
  id: string;
  label: string;
  defaultPath: string;
  content: string;
}

const FILE_TEMPLATES: FileTemplate[] = [
  { id: 'blank', label: 'Blank', defaultPath: '', content: '' },
  {
    id: 'react',
    label: 'React Component',
    defaultPath: 'Component.tsx',
    content: `interface Props {
  // define your props here
}

export default function Component({}: Props) {
  return (
    <div>

    </div>
  );
}
`,
  },
  {
    id: 'python',
    label: 'Python Class',
    defaultPath: 'myclass.py',
    content: `class MyClass:
    def __init__(self):
        pass

    def method(self):
        pass
`,
  },
  {
    id: 'express',
    label: 'Express Route',
    defaultPath: 'route.ts',
    content: `import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ message: 'Hello' });
});

export default router;
`,
  },
  {
    id: 'interface',
    label: 'TS Interface',
    defaultPath: 'types.ts',
    content: `export interface MyInterface {
  id: string;
  name: string;
  createdAt: Date;
}
`,
  },
  {
    id: 'html',
    label: 'HTML Page',
    defaultPath: 'index.html',
    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>

  </body>
</html>
`,
  },
];

interface NewFileDialogProps {
  folderPrefix?: string;
  onConfirm: (path: string, content?: string) => void;
  onClose: () => void;
}

export default function NewFileDialog({ folderPrefix = '', onConfirm, onClose }: NewFileDialogProps) {
  const [templateId, setTemplateId] = useState('blank');
  const [path, setPath] = useState(folderPrefix);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    const tpl = FILE_TEMPLATES.find(t => t.id === id);
    if (!tpl) return;
    if (tpl.id === 'blank') {
      setPath(folderPrefix);
    } else {
      const prefix = folderPrefix ? `${folderPrefix.replace(/\/$/, '')}/` : '';
      setPath(prefix + tpl.defaultPath);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = path.trim().replace(/^\/+/, '');
    if (!trimmed) return;
    const tpl = FILE_TEMPLATES.find(t => t.id === templateId);
    onConfirm(trimmed, tpl?.content ?? '');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#454545] rounded-lg shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">New File</h2>
          <button onClick={onClose} className="text-[#858585] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Template picker */}
          <label className="block text-xs text-[#858585] mb-2">Template</label>
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {FILE_TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTemplateChange(t.id)}
                className={`text-left px-2.5 py-1.5 rounded border transition-colors text-xs ${
                  templateId === t.id
                    ? 'border-[#007acc] bg-[#007acc]/10 text-white'
                    : 'border-[#3c3c3c] bg-[#1e1e1e] text-[#ccc] hover:border-[#555]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* File path */}
          <label className="block text-xs text-[#858585] mb-1">
            File path <span className="text-[#555]">(use / for subfolders)</span>
          </label>
          <input
            autoFocus
            type="text"
            value={path}
            onChange={e => setPath(e.target.value)}
            placeholder="src/index.ts"
            maxLength={500}
            className="w-full bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 text-sm text-white placeholder-[#858585] focus:outline-none focus:border-[#007acc] mb-4 font-mono"
          />

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-[#ccc] hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!path.trim()}
              className="px-3 py-1.5 text-sm bg-[#007acc] text-white rounded hover:bg-[#1a8ad4] disabled:opacity-40 transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
