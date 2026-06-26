import { describe, it, expect } from "vitest";
import { buildKlipyRequestUrl, normalizeKlipyResponse } from "@/lib/klipy.server";

describe("buildKlipyRequestUrl", () => {
  it("uses /gifs/trending when query is empty and embeds the key in the path", () => {
    const url = new URL(buildKlipyRequestUrl({ q: "  ", pos: null, key: "KEY123" }));
    expect(url.pathname).toBe("/api/v1/KEY123/gifs/trending");
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("24");
    expect(url.searchParams.get("rating")).toBe("g");
  });

  it("uses /gifs/search with q, page from pos, and a rating override", () => {
    const url = new URL(buildKlipyRequestUrl({ q: "cat", pos: "3", key: "KEY123", rating: "pg", perPage: 30 }));
    expect(url.pathname).toBe("/api/v1/KEY123/gifs/search");
    expect(url.searchParams.get("q")).toBe("cat");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("per_page")).toBe("30");
    expect(url.searchParams.get("rating")).toBe("pg");
  });

  it("defaults page to 1 when pos is not a positive integer", () => {
    const url = new URL(buildKlipyRequestUrl({ q: "cat", pos: "abc", key: "K" }));
    expect(url.searchParams.get("page")).toBe("1");
  });
});

describe("normalizeKlipyResponse", () => {
  // Trimmed copy of a real Klipy response (api.klipy.com/api/v1/{key}/gifs/search).
  const sample = {
    result: true,
    data: {
      current_page: 1,
      per_page: 24,
      has_next: true,
      data: [
        {
          id: 1885872607941157,
          slug: "nice-cat",
          title: "Sleeping Kitten Tucked In",
          type: "gif",
          file: {
            md: { gif: { url: "https://static.klipy.com/a/md.gif", width: 640, height: 640, size: 4086279 } },
            sm: { gif: { url: "https://static.klipy.com/a/sm.gif", width: 220, height: 220, size: 636464 } },
          },
        },
      ],
    },
  };

  it("maps md.gif as url, sm.gif as preview, title/dims, and computes next page", () => {
    const out = normalizeKlipyResponse(sample);
    expect(out.next).toBe("2");
    expect(out.results).toEqual([
      {
        id: "1885872607941157",
        description: "Sleeping Kitten Tucked In",
        preview: "https://static.klipy.com/a/sm.gif",
        url: "https://static.klipy.com/a/md.gif",
        width: 640,
        height: 640,
      },
    ]);
  });

  it("returns next=null when has_next is false and skips items without a gif file", () => {
    const out = normalizeKlipyResponse({
      data: {
        current_page: 4,
        has_next: false,
        data: [
          { id: 1, title: "ad-or-broken", type: "ad", file: {} },
          { id: 2, title: "no-file" },
        ],
      },
    });
    expect(out.next).toBeNull();
    expect(out.results).toEqual([]);
  });

  it("falls back to hd/xs sizes and to slug when title is absent", () => {
    const out = normalizeKlipyResponse({
      data: {
        current_page: 1,
        has_next: false,
        data: [
          {
            id: 9,
            slug: "only-hd",
            file: {
              hd: { gif: { url: "https://static.klipy.com/b/hd.gif", width: 498, height: 498 } },
              xs: { gif: { url: "https://static.klipy.com/b/xs.gif", width: 100, height: 100 } },
            },
          },
        ],
      },
    });
    expect(out.results).toEqual([
      {
        id: "9",
        description: "only-hd",
        preview: "https://static.klipy.com/b/xs.gif",
        url: "https://static.klipy.com/b/hd.gif",
        width: 498,
        height: 498,
      },
    ]);
  });

  it("returns empty results for malformed input", () => {
    expect(normalizeKlipyResponse(null)).toEqual({ results: [], next: null });
    expect(normalizeKlipyResponse({ data: { data: "nope" } })).toEqual({ results: [], next: null });
  });
});
