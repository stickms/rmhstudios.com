// Monaco editor theme definitions for RMH Code

export interface ThemeMeta {
  id: string;
  label: string;
  bg: string;      // preview background color
  accent: string;  // preview accent / keyword color
  text: string;    // preview text color
}

interface TokenRule {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

interface StandaloneThemeData {
  base: 'vs' | 'vs-dark' | 'hc-black';
  inherit: boolean;
  rules: TokenRule[];
  colors: Record<string, string>;
}

interface CustomTheme extends ThemeMeta {
  data: StandaloneThemeData;
}

// ─── Built-in Monaco themes (no custom data needed) ───────────────────────────

const BUILTIN_THEMES: ThemeMeta[] = [
  { id: 'vs-dark',  label: 'Dark+',          bg: '#1e1e1e', accent: '#569cd6', text: '#d4d4d4' },
  { id: 'vs',       label: 'Light+',         bg: '#ffffff', accent: '#0000ff', text: '#000000' },
  { id: 'hc-black', label: 'High Contrast',  bg: '#000000', accent: '#ffffff', text: '#ffffff' },
];

// ─── Custom theme definitions ─────────────────────────────────────────────────

export const CUSTOM_THEMES: CustomTheme[] = [
  {
    id: 'dracula',
    label: 'Dracula',
    bg: '#282a36',
    accent: '#ff79c6',
    text: '#f8f8f2',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword',          foreground: 'ff79c6' },
        { token: 'keyword.operator', foreground: 'ff79c6' },
        { token: 'string',           foreground: 'f1fa8c' },
        { token: 'number',           foreground: 'bd93f9' },
        { token: 'type',             foreground: '8be9fd' },
        { token: 'function',         foreground: '50fa7b' },
        { token: 'operator',         foreground: 'ff79c6' },
        { token: 'tag',              foreground: 'ff79c6' },
        { token: 'attribute.name',   foreground: '50fa7b' },
        { token: 'attribute.value',  foreground: 'f1fa8c' },
        { token: 'namespace',        foreground: '8be9fd' },
        { token: 'regexp',           foreground: 'f1fa8c' },
        { token: 'constant',         foreground: 'bd93f9' },
      ],
      colors: {
        'editor.background':                 '#282a36',
        'editor.foreground':                 '#f8f8f2',
        'editor.selectionBackground':        '#44475a',
        'editor.lineHighlightBackground':    '#44475a50',
        'editorCursor.foreground':           '#f8f8f2',
        'editorLineNumber.foreground':       '#6272a4',
        'editorLineNumber.activeForeground': '#f8f8f2',
        'editorBracketMatch.background':     '#44475a',
        'editorBracketMatch.border':         '#ff79c6',
      },
    },
  },
  {
    id: 'monokai',
    label: 'Monokai',
    bg: '#272822',
    accent: '#f92672',
    text: '#f8f8f2',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '75715e', fontStyle: 'italic' },
        { token: 'keyword',          foreground: 'f92672' },
        { token: 'keyword.operator', foreground: 'f92672' },
        { token: 'string',           foreground: 'e6db74' },
        { token: 'number',           foreground: 'ae81ff' },
        { token: 'type',             foreground: '66d9e8' },
        { token: 'function',         foreground: 'a6e22e' },
        { token: 'operator',         foreground: 'f92672' },
        { token: 'tag',              foreground: 'f92672' },
        { token: 'attribute.name',   foreground: 'a6e22e' },
        { token: 'attribute.value',  foreground: 'e6db74' },
        { token: 'namespace',        foreground: '66d9e8' },
        { token: 'regexp',           foreground: 'e6db74' },
        { token: 'constant',         foreground: 'ae81ff' },
      ],
      colors: {
        'editor.background':                 '#272822',
        'editor.foreground':                 '#f8f8f2',
        'editor.selectionBackground':        '#49483e',
        'editor.lineHighlightBackground':    '#3e3d3250',
        'editorCursor.foreground':           '#f8f8f0',
        'editorLineNumber.foreground':       '#90908a',
        'editorLineNumber.activeForeground': '#f8f8f0',
        'editorBracketMatch.background':     '#49483e',
        'editorBracketMatch.border':         '#a6e22e',
      },
    },
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    bg: '#002b36',
    accent: '#268bd2',
    text: '#839496',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '586e75', fontStyle: 'italic' },
        { token: 'keyword',          foreground: '859900' },
        { token: 'keyword.operator', foreground: '839496' },
        { token: 'string',           foreground: '2aa198' },
        { token: 'number',           foreground: 'd19a66' },
        { token: 'type',             foreground: 'b58900' },
        { token: 'function',         foreground: '268bd2' },
        { token: 'operator',         foreground: '93a1a1' },
        { token: 'tag',              foreground: '268bd2' },
        { token: 'attribute.name',   foreground: '93a1a1' },
        { token: 'attribute.value',  foreground: '2aa198' },
        { token: 'namespace',        foreground: 'b58900' },
        { token: 'variable',         foreground: 'cb4b16' },
        { token: 'regexp',           foreground: '2aa198' },
        { token: 'constant',         foreground: 'cb4b16' },
      ],
      colors: {
        'editor.background':                 '#002b36',
        'editor.foreground':                 '#839496',
        'editor.selectionBackground':        '#073642',
        'editor.lineHighlightBackground':    '#07364250',
        'editorCursor.foreground':           '#839496',
        'editorLineNumber.foreground':       '#586e75',
        'editorLineNumber.activeForeground': '#93a1a1',
        'editorBracketMatch.background':     '#073642',
        'editorBracketMatch.border':         '#268bd2',
      },
    },
  },
  {
    id: 'one-dark-pro',
    label: 'One Dark Pro',
    bg: '#282c34',
    accent: '#c678dd',
    text: '#abb2bf',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '5c6370', fontStyle: 'italic' },
        { token: 'keyword',          foreground: 'c678dd' },
        { token: 'keyword.operator', foreground: '56b6c2' },
        { token: 'string',           foreground: '98c379' },
        { token: 'number',           foreground: 'd19a66' },
        { token: 'type',             foreground: 'e5c07b' },
        { token: 'function',         foreground: '61afef' },
        { token: 'operator',         foreground: '56b6c2' },
        { token: 'tag',              foreground: 'e06c75' },
        { token: 'attribute.name',   foreground: 'd19a66' },
        { token: 'attribute.value',  foreground: '98c379' },
        { token: 'namespace',        foreground: 'e5c07b' },
        { token: 'variable',         foreground: 'e06c75' },
        { token: 'regexp',           foreground: '98c379' },
        { token: 'constant',         foreground: 'd19a66' },
      ],
      colors: {
        'editor.background':                 '#282c34',
        'editor.foreground':                 '#abb2bf',
        'editor.selectionBackground':        '#3e4451',
        'editor.lineHighlightBackground':    '#2c313c',
        'editorCursor.foreground':           '#528bff',
        'editorLineNumber.foreground':       '#4b5263',
        'editorLineNumber.activeForeground': '#abb2bf',
        'editorBracketMatch.background':     '#3e4451',
        'editorBracketMatch.border':         '#528bff',
      },
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    bg: '#2e3440',
    accent: '#81a1c1',
    text: '#d8dee9',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '616e88', fontStyle: 'italic' },
        { token: 'keyword',          foreground: '81a1c1' },
        { token: 'keyword.operator', foreground: '81a1c1' },
        { token: 'string',           foreground: 'a3be8c' },
        { token: 'number',           foreground: 'b48ead' },
        { token: 'type',             foreground: '8fbcbb' },
        { token: 'function',         foreground: '88c0d0' },
        { token: 'operator',         foreground: '81a1c1' },
        { token: 'tag',              foreground: '81a1c1' },
        { token: 'attribute.name',   foreground: '8fbcbb' },
        { token: 'attribute.value',  foreground: 'a3be8c' },
        { token: 'namespace',        foreground: '8fbcbb' },
        { token: 'regexp',           foreground: 'ebcb8b' },
        { token: 'constant',         foreground: 'b48ead' },
      ],
      colors: {
        'editor.background':                 '#2e3440',
        'editor.foreground':                 '#d8dee9',
        'editor.selectionBackground':        '#434c5e',
        'editor.lineHighlightBackground':    '#3b4252',
        'editorCursor.foreground':           '#d8dee9',
        'editorLineNumber.foreground':       '#4c566a',
        'editorLineNumber.activeForeground': '#d8dee9',
        'editorBracketMatch.background':     '#434c5e',
        'editorBracketMatch.border':         '#88c0d0',
      },
    },
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    bg: '#0d1117',
    accent: '#ff7b72',
    text: '#e6edf3',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',          foreground: '8b949e', fontStyle: 'italic' },
        { token: 'keyword',          foreground: 'ff7b72' },
        { token: 'keyword.operator', foreground: 'e6edf3' },
        { token: 'string',           foreground: 'a5d6ff' },
        { token: 'number',           foreground: '79c0ff' },
        { token: 'type',             foreground: 'ffa657' },
        { token: 'function',         foreground: 'd2a8ff' },
        { token: 'operator',         foreground: 'e6edf3' },
        { token: 'tag',              foreground: '7ee787' },
        { token: 'attribute.name',   foreground: 'ffa657' },
        { token: 'attribute.value',  foreground: 'a5d6ff' },
        { token: 'namespace',        foreground: 'ffa657' },
        { token: 'variable',         foreground: 'ffa657' },
        { token: 'regexp',           foreground: 'a5d6ff' },
        { token: 'constant',         foreground: '79c0ff' },
      ],
      colors: {
        'editor.background':                 '#0d1117',
        'editor.foreground':                 '#e6edf3',
        'editor.selectionBackground':        '#388bfd33',
        'editor.lineHighlightBackground':    '#161b22',
        'editorCursor.foreground':           '#e6edf3',
        'editorLineNumber.foreground':       '#6e7681',
        'editorLineNumber.activeForeground': '#e6edf3',
        'editorBracketMatch.background':     '#388bfd33',
        'editorBracketMatch.border':         '#388bfd',
      },
    },
  },
];

// ─── Full theme list (built-ins + custom) ─────────────────────────────────────

export const ALL_THEMES: ThemeMeta[] = [
  ...BUILTIN_THEMES,
  ...CUSTOM_THEMES.map(({ id, label, bg, accent, text }) => ({ id, label, bg, accent, text })),
];
