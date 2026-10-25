"use client";
import { useState } from "react";

/** 원형 배우 사진. 없거나 깨지면 기본 이미지. */
export default function Avatar({ src, alt, size = 56 }: { src: string | null; alt: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (!src || broken) {
    return <div className="avatar avatar-fallback" style={style} role="img" aria-label={`${alt} 사진 없음`}><span aria-hidden="true">👤</span></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="avatar" style={style} src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}
