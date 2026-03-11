import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";

const ALLOWED_ORIGINS = new Set([
  "https://rmhstudios.com",
  "https://www.rmhstudios.com",
  "https://staging.rmhstudios.com",
]);

function withCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return response;

  // Clone if headers are immutable (e.g. from Better Auth)
  const res = new Response(response.body, response);
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return withCors(await auth.handler(request), request);
      },
      POST: async ({ request }) => {
        return withCors(await auth.handler(request), request);
      },
      OPTIONS: async ({ request }) => {
        return withCors(await auth.handler(request), request);
      },
    },
  },
});
