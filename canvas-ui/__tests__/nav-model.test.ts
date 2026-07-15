/** Shell nav-model tests: structure parity + active-route matching. */

import { describe, expect, it } from "vitest";
import { SHELL_NAV, isNavGroup, isNavActive, type NavGroup } from "@/components/shell/nav-model";

describe("shell nav model", () => {
  it("has the expected top-level destinations in order", () => {
    const tops = SHELL_NAV.filter((i) => !isNavGroup(i)).map((i) => (i as { href: string }).href);
    expect(tops).toEqual(["/", "/search", "/messages", "/create", "/library", "/communities", "/store", "/predictions", "/admin"]);
  });

  it("gates inbox on auth and admin on admin", () => {
    const inbox = SHELL_NAV.find((i) => !isNavGroup(i) && (i as { href: string }).href === "/messages");
    const admin = SHELL_NAV.find((i) => !isNavGroup(i) && (i as { href: string }).href === "/admin");
    expect((inbox as { requiresAuth?: boolean }).requiresAuth).toBe(true);
    expect((admin as { requiresAdmin?: boolean }).requiresAdmin).toBe(true);
  });

  it('groups "More" destinations with an external deeplink', () => {
    const more = SHELL_NAV.find((i) => isNavGroup(i)) as NavGroup;
    expect(more.group).toBe("more");
    expect(more.children.map((c) => c.href)).toContain("/homes");
    expect(more.children.find((c) => c.href === "/deeplink")?.external).toBe(true);
  });

  it("matches active routes like the DOM rail (exact for /, prefix otherwise)", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/", "/search")).toBe(false);
    expect(isNavActive("/store", "/store")).toBe(true);
    expect(isNavActive("/store", "/store/abc")).toBe(true);
    expect(isNavActive("/store", "/storefront")).toBe(false);
  });
});
