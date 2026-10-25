"use client";
import { useState } from "react";

/** 포스터. 이미지가 없거나 깨지면 기본 이미지(🎭)로 바꾼다(SPEC-2 D). */
export default function Poster({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`poster poster-fallback ${className ?? ""}`} role="img" aria-label={`${alt} 포스터 없음`}>
        <span aria-hidden="true">🎭</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- 외부 포스터 주소가 제각각이라 next/image 도메인 설정 대신 img
  return <img className={`poster ${className ?? ""}`} src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}
