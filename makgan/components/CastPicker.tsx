"use client";
import { useEffect, useId, useState } from "react";
import { getCastOptions } from "@/lib/actions/reviews";
import type { CastPick } from "@/lib/review-casts";

type Pick = Required<CastPick>;

/** "그날 캐스트": 공연 캐스팅에서 고르거나, 다른 배우를 배역과 함께 추가(배우 자동완성, SPEC-2 B-5) */
export default function CastPicker({ showId, date, initial, actors }: { showId: string; date?: string; initial: Pick[]; actors: { id: string; name: string }[] }) {
  const [picked, setPicked] = useState<Pick[]>(initial);
  const [options, setOptions] = useState<Pick[]>([]);
  const [role, setRole] = useState("");
  const [actorName, setActorName] = useState("");
  const [error, setError] = useState("");
  const listId = useId();

  useEffect(() => {
    let alive = true;
    if (!showId) { setOptions([]); return; }
    getCastOptions(showId, date).then((o) => alive && setOptions(o)).catch(() => alive && setOptions([]));
    return () => { alive = false; };
  }, [showId, date]);

  const key = (p: CastPick) => `${p.actor_id}:${p.role_name}`;
  const has = (p: CastPick) => picked.some((x) => key(x) === key(p));
  const toggle = (p: Pick) => setPicked((prev) => (has(p) ? prev.filter((x) => key(x) !== key(p)) : [...prev, p]));
  const add = () => {
    const actor = actors.find((a) => a.name === actorName.trim());
    if (!role.trim()) return setError("배역을 입력해 주세요");
    if (!actor) return setError("목록에 있는 배우만 고를 수 있어요");
    const p = { actor_id: actor.id, name: actor.name, role_name: role.trim() };
    if (!has(p)) setPicked((prev) => [...prev, p]);
    setRole(""); setActorName(""); setError("");
  };

  return (
    <fieldset className="cast-picker">
      <legend>그날 캐스트 <small className="muted">(관람일에 맞는 캐스팅을 먼저 보여 줘요 · 통계의 배우 TOP3에 쓰여요)</small></legend>
      <input type="hidden" name="casts" value={JSON.stringify(picked)} />
      {options.length > 0 && (
        <div className="cast-options" aria-label="공연 캐스팅에서 고르기">
          {options.map((o) => (
            <button type="button" key={key(o)} className="chip" aria-pressed={has(o)} onClick={() => toggle(o)}>{o.role_name} · {o.name}</button>
          ))}
        </div>
      )}
      {picked.filter((p) => !options.some((o) => key(o) === key(p))).length > 0 && (
        <ul className="cast-picked">
          {picked.filter((p) => !options.some((o) => key(o) === key(p))).map((p) => (
            <li key={key(p)}>{p.role_name} · {p.name} <button type="button" aria-label={`${p.name} 빼기`} onClick={() => toggle(p)}>×</button></li>
          ))}
        </ul>
      )}
      <div className="field-row cast-add">
        <label className="field"><span>배역</span><input value={role} onChange={(e) => setRole(e.target.value)} maxLength={100} /></label>
        <label className="field"><span>배우</span><input value={actorName} onChange={(e) => setActorName(e.target.value)} list={listId} autoComplete="off" /></label>
        <button type="button" className="btn" onClick={add}>추가</button>
      </div>
      <datalist id={listId}>{actors.map((a) => <option key={a.id} value={a.name} />)}</datalist>
      {error && <p className="form-error" role="alert">{error}</p>}
    </fieldset>
  );
}
