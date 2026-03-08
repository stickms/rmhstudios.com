import { createFileRoute } from '@tanstack/react-router';
import { readFile } from "fs/promises";
import path from "path";
import { resolvePathUnder } from "@/lib/slice-it/upload-validation";
import { optimizeImage, parseFormat, negotiateFormat } from "@/lib/image-optimize";

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

    const url = new URL(request.url);
    const wParam = url.searchParams.get('w');
    const hParam = url.searchParams.get('h');
    const qParam = url.searchParams.get('q');
    const fParam = url.searchParams.get('f');

    const wantsOptimization = wParam || hParam || qParam || fParam;

    if (wantsOptimization) {
      const width = wParam ? Math.min(parseInt(wParam, 10), 2000) : undefined;
      const height = hParam ? Math.min(parseInt(hParam, 10), 2000) : undefined;
      const quality = qParam ? Math.min(Math.max(parseInt(qParam, 10), 1), 100) : 80;
      const format = parseFormat(fParam) ?? negotiateFormat(request.headers.get('accept'));

      const result = await optimizeImage(buffer, { width, height, quality, format });

      return new Response(result.buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
          "Vary": "Accept",
        },
      });
    }

    // Fallback: serve original file as-is
    const ext = path.extname(filename).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Serve build image error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
