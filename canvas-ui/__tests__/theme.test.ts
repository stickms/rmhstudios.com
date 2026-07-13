/** Theme bridge tests: token parity with globals.css + oklab accent math. */

import { describe, expect, it } from "vitest";
import { THEME_TOKENS } from "../theme/tokens";
import { resolveAccent, applyAccentToTokens } from "../theme/accents";
import { mixOklab, parseColor, toCss } from "../theme/color";
import { ACCENT_PRESETS } from "@/lib/appearance";

describe("theme tokens", () => {
  it("exposes the three site themes with the globals.css values", () => {
    expect(Object.keys(THEME_TOKENS).sort()).toEqual(["default", "high-contrast", "light"]);
    expect(THEME_TOKENS.default.surface).toBe("#161617");
    expect(THEME_TOKENS.default.accent).toBe("#9d7bff");
    expect(THEME_TOKENS.default.radius).toBe(18);
    expect(THEME_TOKENS.light.bg).toBe("#f5f5f7");
    expect(THEME_TOKENS.light.text).toBe("#1d1d1f");
    expect(THEME_TOKENS["high-contrast"].accent).toBe("#ffff00");
    expect(THEME_TOKENS["high-contrast"].borderWidth).toBe(2);
  });
});

describe("color utilities", () => {
  it("parses hex/rgb/rgba/transparent", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor("#9d7bff")).toEqual({ r: 157, g: 123, b: 255, a: 1 });
    expect(parseColor("rgba(255, 255, 255, 0.08)")).toEqual({ r: 255, g: 255, b: 255, a: 0.08 });
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it("round-trips css output", () => {
    expect(toCss({ r: 157, g: 123, b: 255, a: 1 })).toBe("rgb(157, 123, 255)");
    expect(toCss({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("mixing with transparent only scales alpha (accent-dim contract)", () => {
    const dim = mixOklab("#8b5cf6", 0.15, "transparent");
    const parsed = parseColor(dim)!;
    expect(parsed.a).toBeCloseTo(0.15, 5);
    // Hue is preserved (premultiplied interpolation).
    expect(parsed.r).toBeCloseTo(139, 0);
    expect(parsed.g).toBeCloseTo(92, 0);
    expect(parsed.b).toBeCloseTo(246, 0);
  });

  it("mixing 82% with black darkens toward black", () => {
    const hover = parseColor(mixOklab("#8b5cf6", 0.82, "#000"))!;
    const base = parseColor("#8b5cf6")!;
    expect(hover.r).toBeLessThan(base.r);
    expect(hover.g).toBeLessThan(base.g);
    expect(hover.b).toBeLessThan(base.b);
    expect(hover.a).toBe(1);
  });
});

describe("accent resolution", () => {
  it("resolves every preset with all four derived tokens", () => {
    for (const preset of ACCENT_PRESETS) {
      const resolved = resolveAccent(preset.id)!;
      expect(resolved.accent).toBe(preset.value);
      expect(resolved.accentFg).toBe(preset.fg);
      expect(parseColor(resolved.accentHover)).not.toBeNull();
      expect(parseColor(resolved.accentDim)!.a).toBeCloseTo(0.15, 4);
    }
  });

  it("returns null / identity for unknown or absent accents", () => {
    expect(resolveAccent(null)).toBeNull();
    expect(resolveAccent("not-a-real-accent")).toBeNull();
    const tokens = THEME_TOKENS.default;
    expect(applyAccentToTokens(tokens, null)).toBe(tokens);
  });

  it("overlays accent tokens onto a theme", () => {
    const themed = applyAccentToTokens(THEME_TOKENS.default, "blue");
    expect(themed.accent).toBe("#3b82f6");
    expect(themed.accentFg).toBe("#ffffff");
    expect(themed.surface).toBe(THEME_TOKENS.default.surface);
  });
});
