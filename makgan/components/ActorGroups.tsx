"use client";
import { useRef, useState } from "react";
import ActorChip from "./ActorChip";
import { loadActorGroup } from "@/lib/actions/actors";
import { initialLabel, type Initial } from "@/lib/initials";
import type { ActorSummary } from "@/lib/data/actors";
import type { Tier } from "@/lib/popularity";

type State = { items: ActorSummary[]; hasMore: boolean; loading: boolean; error: string | null };

/** 이름 첫소리(ㄱㄴㄷ…)별 접이식 묶음. 위의 글자 버튼을 누르면 그 묶음이 열리고 그 자리로 이동. 열 때 처음 한 번만 불러온다. */
export default function ActorGroups({ groups, tier }: { groups: { initial: Initial; count: number }[]; tier?: Tier }) {
  const [data, setData] = useState<Partial<Record<Initial, State>>>({});
  const [open, setOpen] = useState<Initial | null>(null);
  const refs = useRef<Partial<Record<Initial, HTMLDetailsElement | null>>>({});

  async function load(initial: Initial, more = false) {
    const cur = data[initial];
    if (cur?.loading || (!more && cur && !cur.error)) return;
    setData((d) => ({ ...d, [initial]: { items: cur?.items ?? [], hasMore: false, loading: true, error: null } }));
    const r = await loadActorGroup(initial, more ? cur?.items.length ?? 0 : 0, tier);
    setData((d) => ({
      ...d,
      [initial]: "error" in r
        ? { items: cur?.items ?? [], hasMore: false, loading: false, error: r.error }
        : { items: more ? [...(cur?.items ?? []), ...r.items] : r.items, hasMore: r.hasMore, loading: false, error: null },
    }));
  }

  function toggle(initial: Initial, isOpen: boolean) {
    setOpen((o) => (isOpen ? initial : o === initial ? null : o));
    if (isOpen) void load(initial);
  }
  function jump(initial: Initial) {
    const el = refs.current[initial];
    if (!el) return;
    if (!el.open) el.open = true;   // toggle 이벤트가 불러오기까지 이어 준다
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <div className="agroups">
      <nav className="ainit-bar" aria-label="이름 첫소리로 바로가기">
        {groups.map((g) => (
          <button type="button" key={g.initial} className="ainit" aria-pressed={open === g.initial} onClick={() => jump(g.initial)} aria-label={`${initialLabel(g.initial)} ${g.count}명`}>
            {initialLabel(g.initial)}
          </button>
        ))}
      </nav>
      {groups.map((g) => {
        const st = data[g.initial];
        return (
          <details key={g.initial} className="agroup" ref={(el) => { refs.current[g.initial] = el; }} onToggle={(e) => toggle(g.initial, (e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="agroup-head">
              <span className="agroup-name">{initialLabel(g.initial)}</span>
              <span className="muted">{g.count.toLocaleString("ko-KR")}명</span>
            </summary>
            <div className="agroup-body">
              {st?.items.length ? (
                <ul className="actor-grid">
                  {st.items.map((a) => (
                    <li key={a.id}><ActorChip id={a.id} name={a.name} photoUrl={a.photo_url} following={a.following} tier={tier} /></li>
                  ))}
                </ul>
              ) : st?.loading ? <p className="muted" aria-busy="true">불러오는 중…</p> : null}
              {st?.error && <p className="form-error" role="alert">{st.error} <button type="button" className="btn btn-text" onClick={() => load(g.initial, st.items.length > 0)}>다시 시도</button></p>}
              {st?.hasMore && !st.loading && <button type="button" className="btn btn-block more-btn" onClick={() => load(g.initial, true)}>더 보기</button>}
              {st?.hasMore && st.loading && <p className="muted" aria-busy="true">불러오는 중…</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}
