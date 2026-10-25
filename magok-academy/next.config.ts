import type { NextConfig } from "next";

const root = import.meta.dirname;

const nextConfig: NextConfig = {
  // 데이터가 빌드 때 CSV에서 정해지므로 정적 HTML로 내보낸다 (GitHub Pages 배포).
  output: "export",
  // Pages 하위 경로 배포 시 BASE_PATH=/Idol-match/magok-academy
  basePath: process.env.BASE_PATH?.replace(/\/$/, "") || undefined,
  trailingSlash: true,
  // 저장소 루트에도 package-lock.json이 있어 Next가 루트를 잘못 잡지 않게 고정한다.
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
