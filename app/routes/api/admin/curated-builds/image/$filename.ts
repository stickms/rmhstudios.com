import { createFileRoute } from '@tanstack/react-router';
import { readFile } from "fs/promises";
import path from "path";
import { resolvePathUnder } from "@/lib/slice-it/upload-validation";

export const Route = createFileRoute('/api/admin/curated-builds/image/$filename')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { filename } = params;

    const buildsDir = path.join(process.cwd(), "db", "builds");
    const safePath = resolvePathUnder(buildsDir, filename);

    if (!safePath) {
      return Response.json({ error: "Invalid filename" }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(safePath);
    } catch {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    const headers = new Headers();
    const ext = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";

    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Serve build image error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
