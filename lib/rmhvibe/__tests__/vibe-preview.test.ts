import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BundleError,
  buildVibeHtml,
  buildVibePreview,
  collectImportedNames,
  vibeStubModule,
} from '@/lib/rmhvibe/vibe-bundle.server';
import { parsePartialProject } from '@/lib/rmhvibe/vibe-project';

const INDEX =
  "import App from './App'; import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')!).render(<App/>)";
const project =
  (
    files: Record<
      string,
      string
    >,
  ) => ({
    title:
      'T',
    deps: {},
    files,
  });

describe('buildVibePreview', () => {
  it('stubs a missing component', async () => {
    const html =
      await buildVibePreview(
        project(
          {
            'index.tsx':
              INDEX,
          },
        ),
        {
          pending:
            [],
        },
      );
    expect(
      html,
    ).toContain(
      'data-vibe-pending',
    );
  });

  it('stubs named imports', async () => {
    const files =
      {
        'index.tsx':
          "import { Board, Score } from './parts/Board'; import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')!).render(<div><Board/><Score/></div>)",
      };
    expect(
      collectImportedNames(
        files,
        'parts/Board',
      ),
    ).toEqual(
      [
        'Board',
        'Score',
      ],
    );
    await expect(
      buildVibePreview(
        project(
          files,
        ),
        {
          pending:
            [],
        },
      ),
    ).resolves.toContain(
      'data-vibe-pending',
    );
  });

  it('stubs a pending file even when its source is present', async () => {
    const files =
      {
        'index.tsx':
          INDEX,
        'App.tsx':
          'export default function App() { return (',
      };
    const html =
      await buildVibePreview(
        project(
          files,
        ),
        {
          pending:
            [
              'App.tsx',
            ],
        },
      );
    expect(
      html,
    ).toContain(
      'data-vibe-pending',
    );
  });

  it('treats a missing css import as empty', async () => {
    const files =
      {
        'index.tsx':
          "import './styles.css'; document.getElementById('root')!.textContent = 'hi'",
      };
    await expect(
      buildVibePreview(
        project(
          files,
        ),
        {
          pending:
            [],
        },
      ),
    ).resolves.toContain(
      '<div id="root">',
    );
  });

  it('rejects clearly when the entry itself is still pending', async () => {
    const files =
      {
        'index.tsx':
          'import App from "./App"; createRoot(',
      };
    const err =
      await buildVibePreview(
        project(
          files,
        ),
        {
          pending:
            [
              'index.tsx',
            ],
        },
      ).catch(
        (
          e,
        ) =>
          e,
      );
    expect(
      err,
    ).toBeInstanceOf(
      BundleError,
    );
    expect(
      err.message,
    ).toMatch(
      /entry/i,
    );
    expect(
      err.message,
    ).not.toMatch(
      /unexpected|syntax|parse/i,
    );
  });

  it('collects the imported name, not the alias, from a nested importer', () => {
    const files =
      {
        'a/b/C.tsx':
          "import { B as C } from '../parts/B';",
        'a/parts/B.tsx':
          'export const B = 1',
      };
    expect(
      collectImportedNames(
        files,
        'a/parts/B.tsx',
      ),
    ).toEqual(
      [
        'B',
      ],
    );
  });

  it('adds nothing for a namespace import', () => {
    const files =
      {
        'index.tsx':
          "import * as ns from './B';",
        'B.tsx':
          'export const B = 1',
      };
    expect(
      collectImportedNames(
        files,
        'B.tsx',
      ),
    ).toEqual(
      [],
    );
  });

  it('keeps buildVibeHtml strict about missing imports', async () => {
    await expect(
      buildVibeHtml(
        project(
          {
            'index.tsx':
              INDEX,
          },
        ),
      ),
    ).rejects.toBeInstanceOf(
      BundleError,
    );
  });
});

describe('vibeStubModule', () => {
  it('exports default and every named import', () => {
    const src =
      vibeStubModule(
        'parts/Board.tsx',
        [
          'Board',
          'Score',
        ],
      );
    expect(
      src,
    ).toContain(
      'Pending as Board',
    );
    expect(
      src,
    ).toContain(
      'Pending as Score',
    );
    expect(
      src,
    ).toContain(
      'Building Board',
    );
  });
});

describe('parsePartialProject', () => {
  it('reports done and writing files for a stream cut mid-file', () => {
    const raw =
      'TITLE: Demo\nDEPS: zustand@5\n===FILES===\n--- file: index.tsx ---\nimport x\n--- file: ./App.tsx ---\nexport default function';
    const p =
      parsePartialProject(
        raw,
      );
    expect(
      p.done,
    ).toEqual(
      [
        'index.tsx',
      ],
    );
    expect(
      p.writing,
    ).toBe(
      'App.tsx',
    );
    expect(
      p.title,
    ).toBe(
      'Demo',
    );
    expect(
      p.deps,
    ).toEqual(
      {
        zustand:
          '5',
      },
    );
  });
});
