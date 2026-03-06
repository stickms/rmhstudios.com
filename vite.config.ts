import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

export default defineConfig({
  server: {
    port: 7005,
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      srcDirectory: "app",
    }),
    react(),
    nitro(),
  ],
  ssr: {
    external: [
      "audio-decode",
      "wasm-audio-decoders",
      "@wasm-audio-decoders/common",
      "@wasm-audio-decoders/ogg-vorbis",
      "@eshaz/web-worker",
    ],
  },
});
