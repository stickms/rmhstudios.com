import { describe, it, expect } from "vitest";
import { resolveLocale, parseLocaleCookie } from "@/lib/i18n/resolve";

describe("resolveLocale", () => {
  it("prefers a valid cookie", () => {
    expect(resolveLocale({ cookie: "ar", acceptLanguage: "en-US,en" })).toBe("ar");
  });
  it("ignores an invalid cookie and falls back to Accept-Language", () => {
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8" })).toBe("zh");
  });
  it("matches Accept-Language by base language", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "ar-EG,ar;q=0.9" })).toBe("ar");
  });
  it("defaults to en when nothing matches", () => {
    expect(resolveLocale({ cookie: null, acceptLanguage: "de-DE,de" })).toBe("en");
  });
  it("defaults to en when no signal at all", () => {
    expect(resolveLocale({})).toBe("en");
  });
});

describe("parseLocaleCookie", () => {
  it("extracts rmh-lang from a cookie header", () => {
    expect(parseLocaleCookie("foo=1; rmh-lang=zh; bar=2")).toBe("zh");
  });
  it("returns null when absent", () => {
    expect(parseLocaleCookie("foo=1")).toBe(null);
    expect(parseLocaleCookie(null)).toBe(null);
  });
});
