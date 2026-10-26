// 배우 관계도: "같은 공연에 함께 출연"을 관계로 본다. 함께한 공연이 많을수록 가깝다.
export type CastRow = { actor_id: string; show_id: string };
export type Named = { name: string; photo_url?: string | null };

export type RelNode = {
  id: string;
  name: string;
  weight: number; // 중심 배우와 함께한 공연 수
  showIds: string[];
  x: number;
  y: number;
  r: number;
};
export type RelEdge = { a: string; b: string; weight: number };
export type Relations = { center: { id: string; name: string }; nodes: RelNode[]; edges: RelEdge[]; total: number; titles?: Record<string, string> };

export const MAX_NODES = 24;
const INNER_MAX = 10;

/** 원형 배치: 많이 함께한 배우는 안쪽 원, 나머지는 바깥 원. 반지름·좌표는 중심이 (0,0). */
export function layoutRing(count: number, ring: 0 | 1, ringCount: number, startAngle = -Math.PI / 2) {
  const radius = ring === 0 ? 150 : 260;
  const step = (Math.PI * 2) / Math.max(ringCount, 1);
  const angle = startAngle + step * count + (ring === 1 ? step / 2 : 0);
  return { x: Math.round(Math.cos(angle) * radius * 100) / 100, y: Math.round(Math.sin(angle) * radius * 100) / 100 };
}

export function buildRelations(
  centerId: string,
  centerName: string,
  rows: CastRow[],
  names: Map<string, Named>,
  limit = MAX_NODES,
): Relations {
  const centerShows = new Set(rows.filter((r) => r.actor_id === centerId).map((r) => r.show_id));
  const byActor = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.actor_id === centerId || !centerShows.has(r.show_id)) continue;
    (byActor.get(r.actor_id) ?? byActor.set(r.actor_id, new Set()).get(r.actor_id)!).add(r.show_id);
  }
  const ranked = [...byActor.entries()]
    .map(([id, shows]) => ({ id, name: names.get(id)?.name ?? "", shows: [...shows].sort() }))
    .filter((a) => a.name)
    .sort((a, b) => b.shows.length - a.shows.length || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
  const top = ranked.slice(0, limit);
  const inner = Math.min(top.length, INNER_MAX);
  const outer = top.length - inner;
  const maxW = Math.max(1, ...top.map((a) => a.shows.length));

  const nodes: RelNode[] = top.map((a, i) => {
    const ring = i < inner ? 0 : 1;
    const pos = layoutRing(ring === 0 ? i : i - inner, ring, ring === 0 ? inner : outer);
    return { id: a.id, name: a.name, weight: a.shows.length, showIds: a.shows, ...pos, r: 16 + Math.round((a.shows.length / maxW) * 10) };
  });

  // 중심과 이어진 배우끼리도, 두 편 이상 함께했으면 선으로 잇는다(같은 공연 하나뿐이면 너무 빽빽해진다).
  const edges: RelEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const bs = new Set(nodes[j].showIds);
      const w = nodes[i].showIds.filter((s) => bs.has(s)).length;
      if (w >= 2) edges.push({ a: nodes[i].id, b: nodes[j].id, weight: w });
    }
  }
  return { center: { id: centerId, name: centerName }, nodes, edges, total: ranked.length };
}

/** 줌 범위를 벗어나지 않게. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
export function clampZoom(k: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

/** (cx,cy) 화면 좌표를 고정한 채 배율만 바꾼다. */
export function zoomAt(t: { x: number; y: number; k: number }, nextK: number, cx: number, cy: number) {
  const k = clampZoom(nextK);
  const wx = (cx - t.x) / t.k;
  const wy = (cy - t.y) / t.k;
  return { k, x: cx - wx * k, y: cy - wy * k };
}
