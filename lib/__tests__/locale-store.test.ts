import { describe, it, expect } from "vitest";
import { writeLocaleCookie } from "@/stores/localeStore";

describe("writeLocaleCookie", () => {
  it("writes the rmh-lang cookie for the given locale", () => {
    const doc = { cookie: "" };
    writeLocaleCookie("ar", doc);
    expect(doc.cookie).toContain("rmh-lang=ar");
    expect(doc.cookie).toContain("path=/");
  });
});
