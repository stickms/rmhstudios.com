import { describe, it, expect } from "vitest";
import { detectImageExt } from "@/lib/slice-it/upload-validation";

describe("detectImageExt", () => {
  it("detects PNG by magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageExt(png)).toBe(".png");
  });
  it("detects JPEG", () => {
    expect(detectImageExt(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(".jpg");
  });
  it("detects GIF", () => {
    expect(detectImageExt(Buffer.from("GIF89a"))).toBe(".gif");
  });
  it("returns null for unknown", () => {
    expect(detectImageExt(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
  });
});
