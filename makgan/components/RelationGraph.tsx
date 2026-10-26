"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { clampZoom, zoomAt, type Relations } from "@/lib/relations";

const VIEW = 600; // viewBox 한 변. 중심은 (0,0)이라 transform으로 화면 가운데에 둔다.
const HALF = VIEW / 2;
type T = { x: number; y: number; k: number };
const HOME: T = { x: 0, y: 0, k: 1 };

/** 원형 관계도: 가운데가 이 배우, 둘레가 함께 출연한 배우. 버튼·휠·핀치로 확대/축소, 드래그로 이동. */
export default function RelationGraph({ graph }: { graph: Relations }) {
  const [t, setT] = useState<T>(HOME);
  const [picked, setPicked] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; pinch: number | null }>({ moved: 0, pinch: null });

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const sel = picked ? byId.get(picked) ?? null : null;

  // 화면(px) 좌표 → viewBox 좌표
  function toView(clientX: number, clientY: number) {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * VIEW, y: ((clientY - r.top) / r.height) * VIEW };
  }
  const zoomBy = (f: number, cx = HALF, cy = HALF) => setT((cur) => zoomAt(cur, cur.k * f, cx, cy));

  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: 0, pinch: null };
  }
  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const last = gesture.current.pinch;
      gesture.current.pinch = d;
      gesture.current.moved += 10;
      if (last && d > 0) {
        const c = toView((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
        setT((cur) => zoomAt(cur, cur.k * (d / last), c.x, c.y));
      }
      return;
    }
    const r = svg.current!.getBoundingClientRect();
    const dx = ((e.clientX - prev.x) / r.width) * VIEW;
    const dy = ((e.clientY - prev.y) / r.height) * VIEW;
    gesture.current.moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    // 포인터 캡처는 움직이기 시작한 뒤에만: 처음부터 잡으면 노드 클릭이 svg로 넘어가 버린다
    if (gesture.current.moved >= 6 && !svg.current!.hasPointerCapture(e.pointerId)) svg.current!.setPointerCapture(e.pointerId);
    setT((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current.pinch = null;
  }
  function onWheel(e: React.WheelEvent) {
    const c = toView(e.clientX, e.clientY);
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, c.x, c.y);
  }
  // 드래그로 움직였으면 노드 탭으로 치지 않는다
  const tap = (id: string) => () => { if (gesture.current.moved < 6) setPicked((p) => (p === id ? null : id)); };
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "0") setT(HOME);
    else if (e.key.startsWith("Arrow")) {
      const s = 30;
      setT((c) => ({ ...c, x: c.x + (e.key === "ArrowLeft" ? s : e.key === "ArrowRight" ? -s : 0), y: c.y + (e.key === "ArrowUp" ? s : e.key === "ArrowDown" ? -s : 0) }));
    } else return;
    e.preventDefault();
  }

  const labelScale = 1 / Math.sqrt(t.k); // 확대할수록 글자가 지나치게 커지지 않게
  return (
    <div className="rel">
      <div className="rel-stage">
        <svg
          ref={svg}
          className="rel-svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="group"
          aria-label={`${graph.center.name}와 함께 출연한 배우 관계도. +, - 키로 확대·축소, 방향키로 이동`}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          <g data-testid="rel-world" data-zoom={t.k.toFixed(2)} transform={`translate(${HALF + t.x} ${HALF + t.y}) scale(${t.k})`}>
            <circle className="rel-ring" r={150} />
            <circle className="rel-ring" r={260} />
            {graph.edges.map((e) => {
              const a = byId.get(e.a)!, b = byId.get(e.b)!;
              return <line key={e.a + e.b} className="rel-edge rel-edge-weak" x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={Math.min(e.weight, 4) * 0.8} />;
            })}
            {graph.nodes.map((n) => (
              <line key={n.id} className={`rel-edge${picked === n.id ? " rel-edge-on" : ""}`} x1={0} y1={0} x2={n.x} y2={n.y} strokeWidth={Math.min(n.weight, 6) * 1.2} />
            ))}
            {graph.nodes.map((n) => (
              <g
                key={n.id}
                className={`rel-node${picked === n.id ? " rel-node-on" : ""}`}
                transform={`translate(${n.x} ${n.y})`}
                role="button"
                tabIndex={0}
                aria-pressed={picked === n.id}
                aria-label={`${n.name}, 함께한 공연 ${n.weight}편`}
                onClick={tap(n.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked((p) => (p === n.id ? null : n.id)); } }}
              >
                <circle r={n.r} />
                <text className="rel-count" y={7} textAnchor="middle">{n.weight}</text>
                <text className="rel-name" y={n.r + 22 * labelScale} textAnchor="middle" fontSize={20 * labelScale}>{n.name}</text>
              </g>
            ))}
            <g className="rel-center" aria-label={`${graph.center.name} (중심)`}>
              <circle r={46} />
              <text y={7} textAnchor="middle" fontSize={20}>{graph.center.name.length > 6 ? graph.center.name.slice(0, 6) + "…" : graph.center.name}</text>
            </g>
          </g>
        </svg>
        <div className="rel-tools" role="group" aria-label="관계도 보기 조절">
          <button type="button" className="rel-btn" aria-label="확대" onClick={() => zoomBy(1.25)} disabled={t.k >= 4}>＋</button>
          <button type="button" className="rel-btn" aria-label="축소" onClick={() => zoomBy(0.8)} disabled={t.k <= 0.5}>－</button>
          <button type="button" className="rel-btn rel-reset" aria-label="처음 보기로" onClick={() => { setT(HOME); setPicked(null); }}>↺</button>
        </div>
      </div>
      <p className="rel-hint">숫자는 함께한 공연 수예요. 끌어서 옮기고, 두 손가락으로 모으거나 휠로 확대해 보세요.</p>
      {sel ? (
        <div className="rel-panel" role="status">
          <strong>{sel.name}</strong>
          <span className="muted"> · {graph.center.name}와 {sel.weight}편 함께</span>
          <ul className="rel-shows">
            {sel.showIds.map((id) => (
              <li key={id}><Link className="link" href={`/shows/${id}`}>{graph.titles?.[id] ?? "공연"}</Link></li>
            ))}
          </ul>
          <Link className="btn btn-primary rel-go" href={`/actors/${sel.id}`}>{sel.name} 중심으로 보기</Link>
        </div>
      ) : (
        <p className="muted rel-hint">배우를 누르면 함께한 공연을 볼 수 있어요.</p>
      )}
      {graph.total > graph.nodes.length && (
        <p className="muted rel-hint">함께한 배우 {graph.total}명 중 많이 만난 {graph.nodes.length}명만 보여 줘요.</p>
      )}
    </div>
  );
}
