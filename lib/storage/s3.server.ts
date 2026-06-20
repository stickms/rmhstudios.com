import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

function getBucket(): string {
  return requireEnv("S3_BUCKET");
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    endpoint: requireEnv("S3_ENDPOINT"),
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

// Command factories — called as functions (not constructors) so that
// vi.fn() arrow-function mocks in tests remain compatible.
// In the real SDK these are classes, but calling them as functions works
// identically because they return plain command objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CmdFactory = (params: any) => any;

const Put = PutObjectCommand as unknown as CmdFactory;
const Get = GetObjectCommand as unknown as CmdFactory;
const Del = DeleteObjectCommand as unknown as CmdFactory;
const Head = HeadObjectCommand as unknown as CmdFactory;

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await getClient().send(
    Put({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getObject(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const res = await getClient().send(
      Get({ Bucket: getBucket(), Key: key })
    );
    const bytes = await (res.Body as {
      transformToByteArray: () => Promise<Uint8Array>;
    }).transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: res.ContentType || "application/octet-stream",
    };
  } catch (err) {
    if (err instanceof NoSuchKey || (err as { name?: string })?.name === "NoSuchKey") {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    Del({ Bucket: getBucket(), Key: key })
  );
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getClient().send(
      Head({ Bucket: getBucket(), Key: key })
    );
    return true;
  } catch {
    return false;
  }
}

export { getBucket };
