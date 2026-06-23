import { describe, it, expect } from "vitest";
import { applyHtmlLangDir } from "@/lib/i18n/dom";

function fakeEl() {
  const attrs: Record<string, string> = {};
  return {
    lang: "",
    setAttribute(n: string, v: string) { attrs[n] = v; },
    attrs,
  };
}

describe("applyHtmlLangDir", () => {
  it("sets lang and rtl dir for Arabic", () => {
    const el = fakeEl();
    applyHtmlLangDir("ar", el);
    expect(el.lang).toBe("ar");
    expect(el.attrs.dir).toBe("rtl");
  });
  it("sets ltr dir for Chinese", () => {
    const el = fakeEl();
    applyHtmlLangDir("zh", el);
    expect(el.lang).toBe("zh");
    expect(el.attrs.dir).toBe("ltr");
  });
});
