"use client";

// OpenStreetMap 타일 + Leaflet. API 키·가입이 필요 없다.
// Leaflet은 import 시점에 window를 쓰므로 브라우저에서만 동적으로 불러온다.

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, Marker } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Academy } from "@/lib/types";

/** 마곡나루역 부근 */
export const MAGOK_CENTER = { lat: 37.5667, lng: 126.8272 };

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
  const missing = academies.length - located.length;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  // 부모가 매 렌더 새 함수를 넘겨도 마커를 다시 만들지 않도록 ref로 보관
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      const leaflet = (mod as { default?: typeof import("leaflet") }).default ?? mod;
      map.current = leaflet.map(el.current, { zoomControl: true, attributionControl: true }).setView([MAGOK_CENTER.lat, MAGOK_CENTER.lng], 15);
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        })
        .addTo(map.current);
      layer.current = leaflet.layerGroup().addTo(map.current);
      setL(leaflet);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    located.forEach((a, i) => {
      const icon = L.divIcon({
        className: "",
        iconSize: [32, 32],
        // 45° 돌린 핀의 뾰족한 끝이 좌표를 가리키도록
        iconAnchor: [16, 38],
        html: `<span class="pin"><span>${i + 1}</span></span>`,
      });
      const m = L.marker([a.lat, a.lng], { icon, title: a.name, alt: a.name, keyboard: true })
        .on("click", () => onSelectRef.current(a.id))
        .addTo(layer.current!);
      markers.current.set(a.id, m);
    });
    if (located.length > 1) {
      map.current.fitBounds(L.latLngBounds(located.map((a) => [a.lat, a.lng])), { paddingTopLeft: [36, 56], paddingBottomRight: [36, 24], maxZoom: 16 }); // 핀이 좌표 위로 솟아 있어 위쪽 여백을 더 둔다
    } else if (located.length === 1) {
      map.current.setView([located[0].lat, located[0].lng], 16);
    }
  }, [L, located]);

  // 선택 표시만 갱신 (선택이 바뀌어도 지도 범위는 그대로)
  useEffect(() => {
    markers.current.forEach((m, id) => {
      const sel = id === selectedId;
      m.getElement()?.querySelector(".pin")?.classList.toggle("pin-selected", sel);
      m.setZIndexOffset(sel ? 1000 : 0);
    });
  }, [L, located, selectedId]);

  return (
    <div>
      <div ref={el} role="region" aria-label="학원 지도" className="relative z-0 h-[52vh] min-h-72 w-full overflow-hidden rounded-xl bg-surface" />
      {missing > 0 && <p className="mt-1 text-xs text-sub">좌표 미확인 {missing}곳은 지도에 없습니다.</p>}
    </div>
  );
}
