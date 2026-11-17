import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  applyVibeEdit,
  parsePartialProject,
  serializeVibeProject,
} from '@/lib/rmhvibe/vibe-project';
import { parseVibeProject } from '@/lib/rmhvibe/vibe-bundle.server';

const base =
  {
    deps: {
      gsap: '3',
    },
    files:
      {
        'index.tsx':
          'A',
        'App.tsx':
          'B',
        'styles.css':
          'C',
      },
  };

describe('applyVibeEdit', () => {
  it('replaces listed files and keeps the rest byte-identical', () => {
    const r =
      applyVibeEdit(
        base,
        'TITLE: T\n===FILES===\n--- file: ./App.tsx ---\nB2\n',
      );
    expect(
      r?.files,
    ).toEqual(
      {
        'index.tsx':
          'A',
        'App.tsx':
          'B2',
        'styles.css':
          'C',
      },
    );
    expect(
      r?.changed,
    ).toEqual(
      [
        'App.tsx',
      ],
    );
    expect(
      r?.deps,
    ).toEqual(
      {
        gsap: '3',
      },
    );
    expect(
      r?.title,
    ).toBe(
      'T',
    );
  });

  it('removes a file named by a delete line', () => {
    const r =
      applyVibeEdit(
        base,
        '===FILES===\n--- delete: styles.css ---\n',
      );
    expect(
      r?.files,
    ).toEqual(
      {
        'index.tsx':
          'A',
        'App.tsx':
          'B',
      },
    );
    expect(
      r?.deleted,
    ).toEqual(
      [
        'styles.css',
      ],
    );
    expect(
      r?.changed,
    ).toEqual(
      [],
    );
  });

  it('replaces deps when a DEPS line is present', () => {
    const r =
      applyVibeEdit(
        base,
        'DEPS: three@0.183\n===FILES===\n--- file: App.tsx ---\nB2\n',
      );
    expect(
      r?.deps,
    ).toEqual(
      {
        three:
          '0.183',
      },
    );
  });

  it('returns null without the files marker', () => {
    expect(
      applyVibeEdit(
        base,
        'sorry, no',
      ),
    ).toBeNull();
  });
});

describe('serializeVibeProject', () => {
  it('round-trips through the generation parser', () => {
    const p =
      parseVibeProject(
        serializeVibeProject(
          base,
        ),
      );
    expect(
      p?.files,
    ).toEqual(
      base.files,
    );
    expect(
      p?.deps,
    ).toEqual(
      base.deps,
    );
  });
});

describe('edit edge cases', () => {
  it('returns null for an edit that lists no files and no deletes', () => {
    expect(
      applyVibeEdit(
        base,
        'TITLE: T\n===FILES===\n',
      ),
    ).toBeNull();
  });

  it('treats a delete line as the end of the file before it', () => {
    const p =
      parsePartialProject(
        '===FILES===\n--- file: a.tsx ---\nA\n--- delete: b.css ---\n',
      );
    expect(
      p.files,
    ).toEqual(
      {
        'a.tsx':
          'A',
      },
    );
    expect(
      p.done,
    ).toEqual(
      [
        'a.tsx',
      ],
    );
    expect(
      p.writing,
    ).toBeNull();
  });
});
