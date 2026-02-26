import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  deploymentId: process.env.NEXT_DEPLOYMENT_ID || `v-${Date.now()}`,
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
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: https://upload.wikimedia.org https://media.tenor.com https://media1.giphy.com https://i.giphy.com; font-src 'self' data:; connect-src 'self' wss: ws: ${process.env.NEXT_PUBLIC_RMHTUBE_SOCKET_URL || 'http://localhost:7003'} ${(process.env.NEXT_PUBLIC_RMHTUBE_SOCKET_URL || 'http://localhost:7003').replace(/^http/, 'ws')} ${process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676'} ${(process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676').replace(/^http/, 'ws')}; frame-ancestors 'none';`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
