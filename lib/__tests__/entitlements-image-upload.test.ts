import { describe, it, expect, vi } from "vitest";

// Mock prisma.server so the module loads without a real DATABASE_URL.
vi.mock("@/lib/prisma.server", () => ({ prisma: {} }));

import { hasApiImageUpload } from "@/lib/entitlements";

describe("hasApiImageUpload", () => {
  it("grants starter and above, denies free", () => {
    expect(hasApiImageUpload("free")).toBe(false);
    expect(hasApiImageUpload("starter")).toBe(true);
    expect(hasApiImageUpload("pro")).toBe(true);
    expect(hasApiImageUpload("enterprise")).toBe(true);
  });
});
