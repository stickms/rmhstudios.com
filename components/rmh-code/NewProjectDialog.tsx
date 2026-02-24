'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface TemplateFile {
  path: string;
  content: string;
}

interface Template {
  id: string;
  label: string;
  description: string;
  files: TemplateFile[];
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Empty project',
    files: [],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    description: 'index.ts + tsconfig',
    files: [
      {
        path: 'index.ts',
        content: `console.log("Hello, TypeScript!");
`,
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          { compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true, outDir: './dist' } },
          null, 2
        ) + '\n',
      },
      {
        path: 'package.json',
        content: JSON.stringify(
          { name: 'my-project', version: '1.0.0', scripts: { start: 'ts-node index.ts', build: 'tsc' }, devDependencies: { typescript: '^5.0.0', 'ts-node': '^10.0.0' } },
          null, 2
        ) + '\n',
      },
    ],
  },
  {
    id: 'python',
    label: 'Python Script',
    description: 'main.py + requirements.txt',
    files: [
      {
        path: 'main.py',
        content: `def main():
    print("Hello, Python!")


if __name__ == "__main__":
    main()
`,
      },
      {
        path: 'requirements.txt',
        content: `# Add your dependencies here
`,
      },
    ],
  },
  {
    id: 'react',
    label: 'React + Vite',
    description: 'React app with Vite & TypeScript',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      },
      {
        path: 'src/main.tsx',
        content: `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
      },
      {
        path: 'src/App.tsx',
        content: `import { useState } from "react";

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Hello, React!</h1>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
    </div>
  );
}
`,
      },
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'react-app', version: '0.0.0',
            scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
            dependencies: { react: '^18.3.0', 'react-dom': '^18.3.0' },
            devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0', typescript: '^5.0.0', '@types/react': '^18.0.0', '@types/react-dom': '^18.0.0' },
          },
          null, 2
        ) + '\n',
      },
      {
        path: 'vite.config.ts',
        content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
      },
    ],
  },
  {
    id: 'express',
    label: 'Express API',
    description: 'Express + TypeScript REST API',
    files: [
      {
        path: 'src/index.ts',
        content: `import express from "express";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});
`,
      },
      {
        path: 'package.json',
        content: JSON.stringify(
          {
            name: 'express-api', version: '1.0.0',
            scripts: { dev: 'ts-node src/index.ts', build: 'tsc', start: 'node dist/index.js' },
            dependencies: { express: '^4.18.0' },
            devDependencies: { typescript: '^5.0.0', 'ts-node': '^10.0.0', '@types/express': '^4.0.0', '@types/node': '^20.0.0' },
          },
          null, 2
        ) + '\n',
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify(
          { compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true, outDir: './dist', rootDir: './src' } },
          null, 2
        ) + '\n',
      },
    ],
  },
];

interface NewProjectDialogProps {
  onConfirm: (name: string, templateFiles?: Array<{ path: string; content: string }>) => void;
  onClose: () => void;
}

export default function NewProjectDialog({ onConfirm, onClose }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('blank');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const template = TEMPLATES.find(t => t.id === templateId);
    onConfirm(name.trim(), template?.files);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#454545] rounded-lg shadow-2xl w-full max-w-md p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">New Project</h2>
          <button onClick={onClose} className="text-[#858585] hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {/* Project name */}
          <label className="block text-xs text-[#858585] mb-1">Project name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="my-project"
            maxLength={100}
            className="w-full bg-[#3c3c3c] border border-[#555] rounded px-3 py-2 text-sm text-white placeholder-[#858585] focus:outline-none focus:border-[#007acc] mb-4"
          />

          {/* Template picker */}
          <label className="block text-xs text-[#858585] mb-2">Template</label>
          <div className="grid grid-cols-2 gap-2 mb-5">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={`text-left px-3 py-2 rounded border transition-colors ${
                  templateId === t.id
                    ? 'border-[#007acc] bg-[#007acc]/10 text-white'
                    : 'border-[#3c3c3c] bg-[#1e1e1e] text-[#ccc] hover:border-[#555]'
                }`}
              >
                <div className="text-xs font-semibold">{t.label}</div>
                <div className="text-[10px] text-[#858585] mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>

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
              disabled={!name.trim()}
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
