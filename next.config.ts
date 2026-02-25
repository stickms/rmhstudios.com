import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "audio-decode",
    "wasm-audio-decoders",
    "@wasm-audio-decoders/common",
    "@wasm-audio-decoders/ogg-vorbis",
    "@eshaz/web-worker"
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: ws:; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
