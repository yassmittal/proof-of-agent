import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow importing the verifier SDK from the sibling `../src` directory.
  experimental: { externalDir: true },
  // Keep the Mysten SDKs external: @mysten/walrus loads a .wasm asset that breaks when bundled.
  // (@nobulex/* are intentionally left to bundle — they pull ESM-only deps that can't be require()d.)
  serverExternalPackages: ["@mysten/sui", "@mysten/walrus"],
};

export default nextConfig;
