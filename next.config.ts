import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 의원 사진은 경기도의회 서버의 원본(약 280KB) JPEG이다.
    // next/image 최적화 API로 표시 크기(64/40px)에 맞춰 WebP로 줄여 캐시 서빙한다.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.ggc.go.kr",
        pathname: "/site/main/gwstorage/**",
      },
    ],
    // 최적화 결과를 오래 캐시(31일) — 의원 사진은 거의 바뀌지 않음
    minimumCacheTTL: 2_678_400,
  },
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
