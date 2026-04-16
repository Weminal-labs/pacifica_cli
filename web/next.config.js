// setupDevPlatform from @cloudflare/next-on-pages/next-dev injects a timestamp
// versioning middleware that causes CSS/JS static files to 404 in local dev.
// Only enable this when explicitly testing CF Pages behaviour locally.
const path = require("path");
const setupDevPlatform = () => {};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent Three.js / WebGL packages from being bundled server-side
  serverExternalPackages: ["three", "@react-three/fiber", "@react-three/postprocessing", "postprocessing"],
  webpack(config, { isServer }) {
    // Privy optional deps we don't need
    config.resolve.alias["@farcaster/mini-app-solana"] = false;
    config.resolve.alias["@solana-program/memo"] = false;
    // Shared backtest engine lives in src/core/ and is imported via
    // the "@pacifica/core/*" alias (see tsconfig paths).
    config.resolve.alias["@pacifica/core"] = path.resolve(__dirname, "../src/core");
    // Exclude Three.js from server bundle entirely
    if (isServer) {
      config.externals = [...(config.externals || []), "three", "@react-three/fiber", "@react-three/postprocessing", "postprocessing"];
    }
    return config;
  },
};

if (process.env.NODE_ENV === "development") {
  setupDevPlatform();
}

module.exports = nextConfig;
