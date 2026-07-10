import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { safeFetch, SsrfError } from "@/lib/ssrf-guard.server";
/**
 * Proxies an external image URL so the client can load it as a blob
 * for re-cropping without CORS issues.
 */

export const Route = createFileRoute('/api/admin/curated-builds/image/proxy')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !(session.user as any).isAdmin) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url).searchParams.get("url");
    if (!url) {
      return Response.json({ error: "Missing url parameter" }, { status: 400 });
    }

    let res: Response;
    try {
      res = await safeFetch(url, { timeoutMs: 10_000 });
    } catch (e) {
      if (e instanceof SsrfError) {
        return Response.json({ error: "Disallowed image URL" }, { status: 400 });
      }
      throw e;
    }
    if (!res.ok) {
      return Response.json({ error: "Failed to fetch image" }, { status: 502 });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return Response.json({ error: "Not an image" }, { status: 400 });
    }

    const buffer = await res.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "Failed to proxy image" }, { status: 500 });
  }
},
    },
  },
});
