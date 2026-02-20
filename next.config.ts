import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "audio-decode", 
    "wasm-audio-decoders", 
    "@wasm-audio-decoders/common", 
    "@wasm-audio-decoders/ogg-vorbis", 
    "@eshaz/web-worker"
  ],
};

export default nextConfig;
