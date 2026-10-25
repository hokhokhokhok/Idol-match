import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 저장소 루트에도 package-lock.json이 있어 Next가 루트를 잘못 잡지 않게 고정한다.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  // next dev가 AGENTS.md를 만들지 않게
  agentRules: false,
};

export default nextConfig;
