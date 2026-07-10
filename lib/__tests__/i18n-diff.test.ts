import { describe, it, expect } from "vitest";
import { keysToTranslate } from "@/lib/i18n/diff";

describe("keysToTranslate", () => {
  it("includes keys missing from target", () => {
    const out = keysToTranslate({ source: { a: "A", b: "B" }, sources: {}, target: { a: "X" } });
    expect(out).toEqual(["b"]);
  });
  it("includes keys whose English source changed", () => {
    const out = keysToTranslate({
      source: { a: "A2" },
      sources: { a: "A1" },
      target: { a: "translated" },
    });
    expect(out).toEqual(["a"]);
  });
  it("skips keys already translated from the same English source", () => {
    const out = keysToTranslate({
      source: { a: "A" },
      sources: { a: "A" },
      target: { a: "translated" },
    });
    expect(out).toEqual([]);
  });
});
