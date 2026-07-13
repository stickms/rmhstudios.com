/** Table tests for the tw() Tailwind-subset parser. */

import { describe, expect, it } from "vitest";
import { tw, resolveResponsive } from "../runtime/tw";

describe("tw()", () => {
  it("parses flex layout", () => {
    const s = tw("flex flex-col items-center justify-between gap-2 flex-1");
    expect(s.layout).toMatchObject({
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      rowGap: 8,
      columnGap: 8,
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
    });
  });

  it("parses spacing on the 4px scale, sides, fractions, arbitrary px", () => {
    const s = tw("p-4 px-2 mt-10 gap-x-1.5 pb-[18px] -mb-2");
    expect(s.layout.padding).toMatchObject({ top: 16, bottom: 18, left: 8, right: 8 });
    expect(s.layout.margin).toMatchObject({ top: 40, bottom: -8 });
    expect(s.layout.columnGap).toBe(6);
  });

  it("parses sizing incl. percents and arbitrary values", () => {
    const s = tw("w-full h-[52px] max-w-[740px] min-w-0 size-6");
    // size-6 (24px) applies after w-full/h-[52px]
    expect(s.layout.width).toBe(24);
    expect(s.layout.height).toBe(24);
    expect(s.layout.maxWidth).toBe(740);
    expect(s.layout.minWidth).toBe(0);
  });

  it("parses token and literal colors", () => {
    const s = tw("bg-site-surface text-site-text-muted border border-site-border");
    expect(s.paint.fill).toEqual({ token: "surface" });
    expect(s.text.color).toEqual({ token: "text-muted" });
    expect(s.paint.stroke).toEqual({ token: "border" });
    expect(s.paint.strokeWidth).toBe("token");

    const lit = tw("bg-[#0b0b0c] text-[rgba(245,245,247,0.65)]");
    expect(lit.paint.fill).toEqual({ literal: "#0b0b0c" });
    expect(lit.text.color).toEqual({ literal: "rgba(245,245,247,0.65)" });
  });

  it("parses typography", () => {
    const s = tw("text-2xl font-semibold font-display text-center leading-7 truncate uppercase");
    expect(s.text).toMatchObject({
      size: "2xl",
      weight: "semibold",
      family: "display",
      align: "center",
      lineHeightPx: 28,
      truncate: true,
      uppercase: true,
    });
  });

  it("parses radii and shadows", () => {
    expect(tw("rounded-site").paint.cornerRadius).toBe("site");
    expect(tw("rounded-full").paint.cornerRadius).toBe("full");
    expect(tw("rounded-xl").paint.cornerRadius).toBe(12);
    expect(tw("shadow-site").paint.shadow).toBe("site");
  });

  it("buckets responsive prefixes and resolves mobile-first", () => {
    const s = tw("hidden md:flex w-full lg:w-[800px]");
    expect(s.layout.display).toBe("none");
    expect(resolveResponsive(s, 500).layout.display).toBe("none");
    expect(resolveResponsive(s, 800).layout.display).toBe("flex");
    expect(resolveResponsive(s, 800).layout.width).toBe("100%");
    expect(resolveResponsive(s, 1200).layout.width).toBe(800);
  });

  it("throws on unknown classes in dev", () => {
    expect(() => tw("bg-red-500")).toThrow(/unsupported class/);
    expect(() => tw("grid")).toThrow(/unsupported class/);
  });
});
