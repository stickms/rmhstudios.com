import { newMediaId } from "@/lib/media/id";
import { validateUpload } from "@/lib/media/policy";
import { mediaExpiresAt } from "@/lib/media/sweep-policy";
import { feedImageKey, feedImageUrl, contentTypeForFilename } from "@/lib/storage/keys";

export interface UploadDeps {
  prisma: { media: { create(args: { data: Record<string, unknown> }): Promise<unknown> } };
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
}

export async function createMediaFromUpload(
  deps: UploadDeps,
  args: { userId: string; buffer: Buffer; now?: Date }
): Promise<{ id: string; expiresAt: Date }> {
  const validated = validateUpload(args.buffer);
  if (!validated.ok) throw new Error(validated.error);

  const now = args.now ?? new Date();
  const uniqueSuffix = `${now.getTime()}-${Math.round(Math.random() * 1e9)}`;
  const filename = `${args.userId}-${uniqueSuffix}${validated.ext}`;
  const key = feedImageKey(filename);
  const url = feedImageUrl(filename);
  const contentType = contentTypeForFilename(filename);

  await deps.putObject(key, args.buffer, contentType);

  const id = newMediaId();
  await deps.prisma.media.create({
    data: {
      id,
      userId: args.userId,
      key,
      url,
      contentType,
      bytes: args.buffer.length,
      status: "PENDING",
      createdAt: now,
    },
  });

  return { id, expiresAt: mediaExpiresAt(now) };
}
