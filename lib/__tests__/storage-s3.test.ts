// lib/__tests__/storage-s3.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = sendMock;
  }
  class NoSuchKey extends Error {
    name = "NoSuchKey";
  }
  return {
    S3Client,
    PutObjectCommand: vi.fn((input) => ({ __type: "Put", input })),
    GetObjectCommand: vi.fn((input) => ({ __type: "Get", input })),
    DeleteObjectCommand: vi.fn((input) => ({ __type: "Delete", input })),
    HeadObjectCommand: vi.fn((input) => ({ __type: "Head", input })),
    NoSuchKey,
  };
});

beforeEach(() => {
  sendMock.mockReset();
  process.env.S3_ENDPOINT = "http://minio:9000";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  process.env.S3_BUCKET = "rmh-media";
  process.env.S3_FORCE_PATH_STYLE = "true";
  vi.resetModules();
});

describe("s3 wrapper", () => {
  it("putObject sends a PutObjectCommand with bucket/key/body", async () => {
    sendMock.mockResolvedValue({});
    const { putObject, getBucket } = await import("@/lib/storage/s3.server");
    await putObject("rmharks/a.png", Buffer.from("x"), "image/png");
    expect(getBucket()).toBe("rmh-media");
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.__type).toBe("Put");
    expect(cmd.input).toMatchObject({
      Bucket: "rmh-media",
      Key: "rmharks/a.png",
      ContentType: "image/png",
    });
  });

  it("getObject returns body+contentType from the stream", async () => {
    sendMock.mockResolvedValue({
      ContentType: "image/png",
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
    const { getObject } = await import("@/lib/storage/s3.server");
    const result = await getObject("rmharks/a.png");
    expect(result?.contentType).toBe("image/png");
    expect(Array.from(result!.body)).toEqual([1, 2, 3]);
  });

  it("getObject returns null when the key is missing", async () => {
    const { NoSuchKey } = await import("@aws-sdk/client-s3");
    sendMock.mockRejectedValue(new NoSuchKey("missing"));
    const { getObject } = await import("@/lib/storage/s3.server");
    expect(await getObject("rmharks/missing.png")).toBeNull();
  });
});
