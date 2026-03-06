import { defineConfig } from "@tanstack/react-start/config";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  tsr: {
    appDirectory: "app",
    routesDirectory: "app/routes",
    generatedRouteTree: "app/routeTree.gen.ts",
  },
  vite: {
    plugins: [
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
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
  },
});
