import { createFileRoute } from '@tanstack/react-router';

import { prisma } from "@/lib/prisma";
import { readFile, stat } from "fs/promises";
import { createReadStream } from "fs";
import { resolvePathUnder } from "@/lib/slice-it/upload-validation";
import path from "path";

export const Route = createFileRoute('/api/slice-it/songs/stream/$id')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const { id } = params;
    
    const song = await prisma.song.findUnique({
      where: { id },
      select: { audioUrl: true, title: true, artist: true }
    });

    if (!song) {
      return Response.json({ error: "Song not found" }, { status: 404 });
    }

    const musicDir = path.join(process.cwd(), "db", "music");
    const filePath = resolvePathUnder(musicDir, song.audioUrl);
    if (!filePath) {
      return Response.json({ error: "Invalid path" }, { status: 400 });
    }

    try {
        await stat(filePath);
    } catch {
        return Response.json({ error: "File not found on disk" }, { status: 404 });
    }

    // Stream the file
    // Implementing basic range handling for audio seeking support is good practice
    const stats = await stat(filePath);
    const fileSize = stats.size;
    const range = request.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        });
      }

      const chunksize = (end - start) + 1;
      const stream = createReadStream(filePath, { start, end });
      
      // Node stream to Web stream conversion
      const readable = new ReadableStream({
        start(controller) {
            stream.on('data', (chunk) => controller.enqueue(chunk));
            stream.on('end', () => controller.close());
            stream.on('error', (err) => controller.error(err));
        }
      });

      return new Response(readable, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": "audio/mpeg", // Or detect type
        },
      });
    } else {
        const fileBuffer = await readFile(filePath);
        return new Response(fileBuffer, {
            headers: {
                "Content-Length": fileSize.toString(),
                "Content-Type": "audio/mpeg",
            }
        });
    }

  } catch (error) {
    console.error("Stream error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
},
    },
  },
});
