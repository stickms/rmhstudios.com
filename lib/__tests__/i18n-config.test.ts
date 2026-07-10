import { describe, it, expect } from "vitest";
import { dirFor, isLocale, DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";

describe("i18n config", () => {
  it("marks RTL locales as rtl and others as ltr", () => {
    expect(dirFor("ar")).toBe("rtl");
    expect(dirFor("ur")).toBe("rtl");
    expect(dirFor("en")).toBe("ltr");
    expect(dirFor("zh")).toBe("ltr");
    expect(dirFor("es")).toBe("ltr");
  });
  it("validates locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
  it("exposes a label for every supported locale", () => {
    for (const l of LOCALES) expect(LOCALE_LABELS[l]).toBeTruthy();
  });
  it("defaults to English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
});
