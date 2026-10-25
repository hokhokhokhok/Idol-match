"use client";

// 카카오맵 JS SDK. NEXT_PUBLIC_KAKAO_MAP_KEY가 없거나 SDK 로드에 실패하면 좌표만 찍는 간이 약도로 대신한다.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Academy } from "@/lib/types";

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";
/** 마곡나루역 부근 */
export const MAGOK_CENTER = { lat: 37.5667, lng: 126.8272 };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao?: any;
  }
}

let sdkPromise: Promise<any> | null = null;
function loadKakao(): Promise<any> {
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  sdkPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_KEY)}&autoload=false`;
    s.async = true;
    s.onload = () => (window.kakao?.maps ? window.kakao.maps.load(() => resolve(window.kakao)) : reject(new Error("kakao")));
    s.onerror = () => reject(new Error("kakao sdk"));
    document.head.appendChild(s);
  }).catch((e) => {
    sdkPromise = null;
    throw e;
  });
  return sdkPromise;
}

type Located = Academy & { lat: number; lng: number };

export default function AcademyMap({
  academies,
  selectedId,
  onSelect,
}: {
  academies: Academy[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const located = useMemo(() => academies.filter((a): a is Located => a.lat !== null && a.lng !== null), [academies]);
  const [mode, setMode] = useState<"kakao" | "fallback">(KAKAO_KEY ? "kakao" : "fallback");
  const missing = academies.length - located.length;

  return (
    <div>
      {mode === "kakao" ? (
        <KakaoMap located={located} selectedId={selectedId} onSelect={onSelect} onFail={() => setMode("fallback")} />
      ) : (
        <SketchMap located={located} selectedId={selectedId} onSelect={onSelect} />
      )}
      <p className="mt-1 text-xs text-sub">
        {mode === "fallback" && "지도 키가 없어 학원 간 상대 위치만 보여 줍니다. "}
        {missing > 0 && `좌표 미확인 ${missing}곳은 지도에 없습니다.`}
      </p>
    </div>
  );
}

function KakaoMap({
  located,
  selectedId,
  onSelect,
  onFail,
}: {
  located: Located[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFail: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  // 부모가 매 렌더 새 함수를 넘겨도 지도를 다시 만들지 않도록 ref로 보관
  const onSelectRef = useRef(onSelect);
  const onFailRef = useRef(onFail);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onFailRef.current = onFail;
  });

  useEffect(() => {
    let cancelled = false;
    loadKakao()
      .then((kakao) => {
        if (cancelled || !el.current) return;
        map.current = new kakao.maps.Map(el.current, {
          center: new kakao.maps.LatLng(MAGOK_CENTER.lat, MAGOK_CENTER.lng),
          level: 5,
        });
        setReady(true);
      })
      .catch(() => !cancelled && onFailRef.current());
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const kakao = window.kakao;
    if (!ready || !kakao) return;
    markers.current.forEach((m) => m.setMap(null));
    const bounds = new kakao.maps.LatLngBounds();
    markers.current = located.map((a) => {
      const pos = new kakao.maps.LatLng(a.lat, a.lng);
      bounds.extend(pos);
      const m = new kakao.maps.Marker({ position: pos, map: map.current, title: a.name, zIndex: a.id === selectedId ? 2 : 1 });
      kakao.maps.event.addListener(m, "click", () => onSelectRef.current(a.id));
      return m;
    });
    if (located.length > 1) map.current.setBounds(bounds, 40, 40, 40, 40);
    else if (located.length === 1) map.current.setCenter(new kakao.maps.LatLng(located[0].lat, located[0].lng));
  }, [ready, located, selectedId]);

  return <div ref={el} role="region" aria-label="학원 지도" className="h-[52vh] min-h-72 w-full rounded-xl bg-surface" />;
}

/** 키 없이도 쓰는 간이 약도: 학원 좌표를 상자 안에 비율로 배치 */
function SketchMap({
  located,
  selectedId,
  onSelect,
}: {
  located: Located[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const pts = located.length ? located : [];
  const lats = [...pts.map((a) => a.lat), MAGOK_CENTER.lat];
  const lngs = [...pts.map((a) => a.lng), MAGOK_CENTER.lng];
  const pad = 0.002;
  const [minLat, maxLat] = [Math.min(...lats) - pad, Math.max(...lats) + pad];
  const [minLng, maxLng] = [Math.min(...lngs) - pad, Math.max(...lngs) + pad];
  const pos = (lat: number, lng: number) => ({
    left: `${((lng - minLng) / (maxLng - minLng)) * 100}%`,
    top: `${((maxLat - lat) / (maxLat - minLat)) * 100}%`,
  });

  return (
    <div
      role="region"
      aria-label="학원 위치 약도"
      className="relative h-[52vh] min-h-72 w-full overflow-hidden rounded-xl border border-line bg-[linear-gradient(#ece9f2_1px,transparent_1px),linear-gradient(90deg,#ece9f2_1px,transparent_1px)] bg-[size:32px_32px]"
    >
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-[11px] text-sub"
        style={pos(MAGOK_CENTER.lat, MAGOK_CENTER.lng)}
      >
        Ⓜ 마곡나루역
      </span>
      {pts.map((a, i) => {
        const sel = a.id === selectedId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            aria-label={a.name}
            aria-pressed={sel}
            className={`absolute grid size-8 -translate-x-1/2 -translate-y-full place-items-center rounded-full rounded-br-none rotate-45 border-2 border-white text-xs font-bold shadow ${
              sel ? "z-10 scale-125 bg-brand text-white" : "bg-white text-brand"
            }`}
            style={pos(a.lat, a.lng)}
          >
            <span className="-rotate-45">{i + 1}</span>
          </button>
        );
      })}
    </div>
  );
}
