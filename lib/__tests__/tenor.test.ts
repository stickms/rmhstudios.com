// lib/__tests__/tenor.test.ts
import { describe, it, expect } from "vitest";
import { buildTenorRequestUrl, normalizeTenorResponse } from "@/lib/tenor.server";

describe("buildTenorRequestUrl", () => {
  it("uses /v2/featured when query is empty", () => {
    const url = new URL(buildTenorRequestUrl({ q: "  ", pos: null, key: "K" }));
    expect(url.pathname).toBe("/v2/featured");
    expect(url.searchParams.get("key")).toBe("K");
    expect(url.searchParams.get("contentfilter")).toBe("high");
    expect(url.searchParams.get("media_filter")).toBe("tinygif,gif");
    expect(url.searchParams.get("limit")).toBe("24");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("uses /v2/search with q and pos when provided", () => {
    const url = new URL(buildTenorRequestUrl({ q: "cat", pos: "20", key: "K", clientKey: "rmh", limit: 10 }));
    expect(url.pathname).toBe("/v2/search");
    expect(url.searchParams.get("q")).toBe("cat");
    expect(url.searchParams.get("pos")).toBe("20");
    expect(url.searchParams.get("client_key")).toBe("rmh");
    expect(url.searchParams.get("limit")).toBe("10");
  });
});

describe("normalizeTenorResponse", () => {
  it("maps gif + tinygif formats and reads next", () => {
    const out = normalizeTenorResponse({
      next: "30",
      results: [
        {
          id: "abc",
          content_description: "happy cat",
          media_formats: {
            gif: { url: "https://media.tenor.com/abc/full.gif", dims: [320, 240] },
            tinygif: { url: "https://media.tenor.com/abc/tiny.gif", dims: [150, 112] },
          },
        },
      ],
    });
    expect(out.next).toBe("30");
    expect(out.results).toEqual([
      { id: "abc", description: "happy cat", preview: "https://media.tenor.com/abc/tiny.gif", url: "https://media.tenor.com/abc/full.gif", width: 320, height: 240 },
    ]);
  });

  it("skips entries missing a required format and maps empty next to null", () => {
    const out = normalizeTenorResponse({
      next: "",
      results: [
        { id: "x", media_formats: { gif: { url: "https://media.tenor.com/x/g.gif", dims: [1, 1] } } },
        { id: "y", media_formats: {} },
      ],
    });
    expect(out.next).toBeNull();
    expect(out.results).toEqual([]);
  });

  it("returns empty results for malformed input", () => {
    expect(normalizeTenorResponse(null)).toEqual({ results: [], next: null });
    expect(normalizeTenorResponse({ results: "nope" })).toEqual({ results: [], next: null });
  });
});
