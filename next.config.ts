import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // hwp.js bundles cfb, which statically imports Node's `fs`. We never hit
      // the fs code path in the browser (we parse from an ArrayBuffer), so alias
      // it to an inert stub for the client build.
      fs: { browser: "./lib/empty-module.js" },
    },
  },
};

export default nextConfig;
