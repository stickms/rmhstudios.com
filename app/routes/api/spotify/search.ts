import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Spotify credentials missing — SPOTIFY_CLIENT_ID:", !!clientId, "SPOTIFY_CLIENT_SECRET:", !!clientSecret);
    throw new Error("Spotify credentials not configured");
  }

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error("Failed to get Spotify token");
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

interface SpotifyTrack {
  id: string;
  name: string;
  preview_url: string | null;
  artists: { name: string }[];
  album: {
    images: { url: string; width: number; height: number }[];
  };
}

export const APIRoute = createAPIFileRoute("/api/spotify/search")({
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 30,
      windowMs: 60_000,
      prefix: "spotify-search",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const q = new URL(request.url).searchParams.get("q")?.trim();
    if (!q || q.length === 0) {
      return Response.json({ tracks: [] });
    }

    const token = await getSpotifyToken();
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("type", "track");
    searchUrl.searchParams.set("limit", "10");
    searchUrl.searchParams.set("market", "US");

    const res = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("Spotify search error:", res.status, await res.text());
      return Response.json({ error: "Search failed" }, { status: 502 });
    }

    const data = await res.json();
    const tracks = (data.tracks?.items ?? []).map((t: SpotifyTrack) => ({
      id: t.id,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(", "),
      previewUrl: t.preview_url,
      albumArt:
        t.album.images.find((img) => img.width === 300)?.url ??
        t.album.images[0]?.url ??
        null,
    }));

    return Response.json({ tracks });
  } catch (error) {
    console.error("Spotify search error:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
},
});
