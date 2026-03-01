import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ─── Security: Remove the X-Powered-By header ───
  poweredByHeader: false,

  // ─── Performance: Enable gzip/brotli compression ───
  compress: true,

  // ─── Performance: Image optimization ───
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // ─── Performance: Experimental features ───
  experimental: {
    optimizeServerReact: true,
    // Tree-shake barrel exports for heavy packages — dramatically reduces
    // client bundle size by only importing the specific modules used.
    optimizePackageImports: [
      "lucide-react",
      "react-icons",
      "framer-motion",
      "recharts",
      "@radix-ui/react-dialog",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "radix-ui",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@tiptap/react",
      "@tiptap/starter-kit",
      "@tiptap/pm",
      "@tiptap/extension-character-count",
      "@tiptap/extension-code-block-lowlight",
      "@tiptap/extension-color",
      "@tiptap/extension-highlight",
      "@tiptap/extension-image",
      "@tiptap/extension-link",
      "@tiptap/extension-placeholder",
      "@tiptap/extension-table",
      "@tiptap/extension-table-cell",
      "@tiptap/extension-table-header",
      "@tiptap/extension-table-row",
      "@tiptap/extension-task-item",
      "@tiptap/extension-task-list",
      "@tiptap/extension-text-align",
      "@tiptap/extension-text-style",
      "@tiptap/extension-underline",
      "emoji-mart",
      "@emoji-mart/data",
      "@emoji-mart/react",
      "date-fns",
      "zod",
      "sonner",
      "class-variance-authority",
      "@react-three/drei",
      "@react-three/fiber",
      "@tanstack/react-virtual",
      "embla-carousel-react",
      "@monaco-editor/react",
      "react-colorful",
      "react-easy-crop",
      "canvas-confetti",
      "katex",
    ],
  },

  serverExternalPackages: [
    "audio-decode",
    "wasm-audio-decoders",
    "@wasm-audio-decoders/common",
    "@wasm-audio-decoders/ogg-vorbis",
    "@eshaz/web-worker",
  ],

  async headers() {
    return [
      // ─── Immutable cache for static assets (JS, CSS, fonts, images) ───
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sprites/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/textures/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/music/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400",
          },
        ],
      },
      // ─── Security headers for all routes ───
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
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https: https://upload.wikimedia.org https://media.tenor.com https://media1.giphy.com https://i.giphy.com; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://api.open-meteo.com https://geocoding-api.open-meteo.com wss: ws: ${process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:7001'} ${(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:7001').replace(/^http/, 'ws')} ${process.env.NEXT_PUBLIC_RMHTUBE_SOCKET_URL || 'http://localhost:7003'} ${(process.env.NEXT_PUBLIC_RMHTUBE_SOCKET_URL || 'http://localhost:7003').replace(/^http/, 'ws')} ${process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676'} ${(process.env.NEXT_PUBLIC_RMHBOX_SOCKET_URL || 'http://localhost:7676').replace(/^http/, 'ws')}; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv; frame-ancestors 'none';`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
