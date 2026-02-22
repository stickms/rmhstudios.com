const EXT_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  css: 'css', scss: 'scss',
  json: 'json', md: 'markdown',
  html: 'html', htm: 'html',
  py: 'python', rs: 'rust',
  go: 'go', sh: 'shell',
  yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml',
  sql: 'sql', c: 'c', cpp: 'cpp',
  java: 'java', rb: 'ruby', php: 'php',
};

export function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? 'plaintext';
}

export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    ts: '󰛦', tsx: '󰛦', js: '󰌞', jsx: '󰌞',
    css: '󰌜', scss: '󰌜', json: '󰘦',
    md: '󰍔', html: '󰌝', py: '󰌠',
    rs: '󱘗', go: '󰟓', sh: '󱆃',
    yaml: '󰘦', yml: '󰘦', toml: '󰘦',
  };
  return icons[ext] ?? '󰈙';
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { files: number };
}

export interface FileMeta {
  id: string;
  name: string;
  path: string;
  language: string | null;
  updatedAt: string;
}
