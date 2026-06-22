import { createFileRoute } from "@tanstack/react-router";
import { prisma } from "@/lib/prisma.server";
import { putObject } from "@/lib/storage/s3.server";
import { withDeveloperApi, apiJson, apiError, apiOptions } from "@/lib/api/with-developer-api.server";
import { createMediaFromUpload } from "@/lib/media/upload.server";
import { MEDIA_MAX_BYTES } from "@/lib/media/policy";

/**
 * POST /api/v1/images — upload one image, get an opaque media_id back.
 * Attach it to a post via POST /api/v1/posts { media_ids: [...] }.
 */
export const Route = createFileRoute("/api/v1/images")({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request }) =>
        withDeveloperApi(request, async ({ userId }) => {
          // Reject oversize bodies before reading them into memory.
          const declared = Number(request.headers.get("content-length") ?? "0");
          if (declared > MEDIA_MAX_BYTES) {
            return apiError("payload_too_large", `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.`, 413);
          }

          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return apiError("invalid_request", "Expected multipart/form-data with an `image` field.", 400);
          }
          const file = form.get("image");
          if (!(file instanceof File) || file.size === 0) {
            return apiError("invalid_request", "No image provided. Send one file in the `image` field.", 400);
          }
          if (file.size > MEDIA_MAX_BYTES) {
            return apiError("invalid_request", `Image too large. Maximum size is ${MEDIA_MAX_BYTES / 1024 / 1024} MB.`, 400);
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          try {
            const { id, expiresAt } = await createMediaFromUpload({ prisma, putObject }, { userId, buffer });
            return apiJson({ id, type: "image", expires_at: expiresAt.toISOString() }, 201);
          } catch (err) {
            return apiError("invalid_request", err instanceof Error ? err.message : "Invalid image.", 400);
          }
        }),
    },
  },
});
