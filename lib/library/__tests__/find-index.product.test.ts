import { describe, expect, it, vi } from 'vitest';
import { createFindIndex, type UnitMatches } from '../find-index';

const OPTIONS = {
  matchCase: false,
  wholeWords: false,
};
const noYield = () => Promise.resolve();

function pagesSource(pages: string[], onLoad?: (unit: number) => void) {
  return {
    count: pages.length,
    load: vi.fn(async (unit: number) => {
      onLoad?.(unit);
      return pages[unit - 1] ?? '';
    }),
  };
}

describe('createFindIndex', () => {
  it('reports results in page order', async () => {
    const source = {
      count: 5,
      // Later pages answer sooner than earlier ones.
      load: vi.fn(
        (unit: number) =>
          new Promise<string>((resolve) => setTimeout(() => resolve(`page ${unit} has a needle`), (6 - unit) * 3)),
      ),
    };
    const index = createFindIndex(source, {
      yieldToMain: noYield,
    });
    const seen: UnitMatches[] = [];
    const summary = await index.search('needle', OPTIONS, {
      signal: new AbortController().signal,
      onMatches: (m) => seen.push(m),
    });
    expect(seen.map((m) => m.unit)).toEqual([1, 2, 3, 4, 5]);
    expect(summary).toEqual({
      aborted: false,
      matches: 5,
      units: 5,
      searchable: true,
    });
  });

  it('stops extracting once the search is cancelled', async () => {
    const controller = new AbortController();
    const source = pagesSource(
      Array.from(
        {
          length: 50,
        },
        (_, i) => `text ${i}`,
      ),
      (unit) => {
        if (unit === 4) controller.abort();
      },
    );
    const index = createFindIndex(source, {
      yieldToMain: noYield,
    });
    const summary = await index.search('text', OPTIONS, {
      signal: controller.signal,
    });
    expect(summary.aborted).toBe(true);
    expect(source.load).toHaveBeenCalledTimes(4);
  });

  it('stops when cancelled while a yield is pending', async () => {
    const controller = new AbortController();
    const source = pagesSource(
      Array.from(
        {
          length: 20,
        },
        () => 'word',
      ),
    );
    let yields = 0;
    const index = createFindIndex(source, {
      yieldToMain: async () => {
        if (++yields === 2) controller.abort();
      },
    });
    await index.search('word', OPTIONS, {
      signal: controller.signal,
    });
    expect(source.load).toHaveBeenCalledTimes(2);
  });

  it('reuses extracted text for the next search', async () => {
    const source = pagesSource(['alpha beta', 'beta gamma', 'gamma delta']);
    const index = createFindIndex(source, {
      yieldToMain: noYield,
    });
    const signal = new AbortController().signal;
    await index.search('beta', OPTIONS, {
      signal,
    });
    const second: number[] = [];
    await index.search('gamma', OPTIONS, {
      signal,
      onMatches: (m) => second.push(m.unit),
    });
    expect(second).toEqual([2, 3]);
    expect(source.load).toHaveBeenCalledTimes(3);
    expect(index.textOf(2)).toBe('beta gamma');
  });

  it('shares one extraction between overlapping searches', async () => {
    const source = pagesSource(['one', 'two', 'three']);
    const index = createFindIndex(source, {
      yieldToMain: noYield,
    });
    const signal = new AbortController().signal;
    await Promise.all([
      index.search('one', OPTIONS, {
        signal,
      }),
      index.search('two', OPTIONS, {
        signal,
      }),
    ]);
    expect(source.load).toHaveBeenCalledTimes(3);
  });

  it('reports progress for every unit', async () => {
    const source = pagesSource(['a', 'b', 'c']);
    const index = createFindIndex(source, {
      yieldToMain: noYield,
    });
    const progress: Array<[number, number]> = [];
    await index.search('zzz', OPTIONS, {
      signal: new AbortController().signal,
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('is not searchable when no page has text', async () => {
    const index = createFindIndex(pagesSource(['', ' ', '\n']), {
      yieldToMain: noYield,
    });
    const summary = await index.search('anything', OPTIONS, {
      signal: new AbortController().signal,
    });
    expect(summary).toEqual({
      aborted: false,
      matches: 0,
      units: 0,
      searchable: false,
    });
  });

  it('treats a page that fails to extract as empty', async () => {
    const source = {
      count: 3,
      load: vi.fn(async (unit: number) => {
        if (unit === 2) throw new Error('boom');
        return `needle ${unit}`;
      }),
    };
    const index = createFindIndex(source, {
      yieldToMain: noYield,
    });
    const seen: number[] = [];
    const summary = await index.search('needle', OPTIONS, {
      signal: new AbortController().signal,
      onMatches: (m) => seen.push(m.unit),
    });
    expect(seen).toEqual([1, 3]);
    expect(summary.aborted).toBe(false);
  });

  it('gives the main thread back while matching cached pages', async () => {
    const source = pagesSource(
      Array.from(
        {
          length: 30,
        },
        () => 'needle',
      ),
    );
    let yields = 0;
    const index = createFindIndex(source, {
      yieldToMain: async () => {
        yields++;
      },
      sliceMs: 0,
    });
    const signal = new AbortController().signal;
    await index.search('needle', OPTIONS, {
      signal,
    });
    const afterFirst = yields;
    await index.search('needle', OPTIONS, {
      signal,
    });
    expect(yields - afterFirst).toBe(30);
  });

  it('matches ranges as offsets into the extracted text', async () => {
    const index = createFindIndex(pagesSource(['Le café est ouvert']), {
      yieldToMain: noYield,
    });
    const seen: UnitMatches[] = [];
    await index.search('CAFE', OPTIONS, {
      signal: new AbortController().signal,
      onMatches: (m) => seen.push(m),
    });
    expect(seen[0]!.ranges).toEqual([
      {
        start: 3,
        end: 7,
      },
    ]);
  });
});
