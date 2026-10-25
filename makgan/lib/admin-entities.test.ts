import { test } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_ENTITIES, isoToKstLocal, kstLocalToIso, parseEntityForm } from "./admin-entities.ts";

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("KST 입력 ↔ ISO", () => {
  assert.equal(kstLocalToIso("2026-11-05T20:00"), "2026-11-05T11:00:00.000Z");
  assert.equal(isoToKstLocal("2026-11-05T11:00:00.000Z"), "2026-11-05T20:00");
});

test("혜택: 정상 입력, 빈 칸은 null, 시각은 KST로 해석", () => {
  const r = parseEntityForm(ADMIN_ENTITIES.benefits, form({ type: "lottery", title: " 로터리 ", ends_at: "2026-11-05T18:00", show_id: "" }));
  assert.ok("value" in r);
  assert.equal(r.value.title, "로터리");
  assert.equal(r.value.show_id, null);
  assert.equal(r.value.ends_at, "2026-11-05T09:00:00.000Z");
});

test("검증 실패", () => {
  const err = (key: keyof typeof ADMIN_ENTITIES, o: Record<string, string>) => {
    const r = parseEntityForm(ADMIN_ENTITIES[key], form(o));
    return "error" in r ? r.error : null;
  };
  assert.match(err("benefits", { type: "lottery" })!, /제목/);
  assert.match(err("benefits", { type: "hack", title: "x" })!, /종류/);
  assert.match(err("benefits", { type: "event", title: "x", starts_at: "2026-11-05T18:00", ends_at: "2026-11-05T17:00" })!, /마감이 시작보다/);
  assert.match(err("shows", { title: "x", starts_on: "2026-11-05", ends_on: "2026-11-01" })!, /종료일/);
  assert.match(err("shows", { title: "x", starts_on: "2026-11-05", ends_on: "2026-11-06", theater_id: "1 or 1=1" })!, /극장/);
  assert.match(err("actors", { name: "x", photo_url: "javascript:alert(1)" })!, /http/);
  assert.match(err("theaters", { name: "x", seat_count: "-3" })!, /양의 정수/);
});

test("영상: 주소 → id, 공연·배우 중 하나 필수", () => {
  const ok = parseEntityForm(ADMIN_ENTITIES.videos, form({ youtube_id: "https://youtu.be/dQw4w9WgXcQ", title: "x", actor_id: "00000000-0000-4000-8000-000000000301" }));
  assert.ok("value" in ok && ok.value.youtube_id === "dQw4w9WgXcQ");
  const none = parseEntityForm(ADMIN_ENTITIES.videos, form({ youtube_id: "dQw4w9WgXcQ", title: "x" }));
  assert.ok("error" in none && /하나는/.test(none.error));
  const bad = parseEntityForm(ADMIN_ENTITIES.videos, form({ youtube_id: "https://vimeo.com/1", title: "x", actor_id: "00000000-0000-4000-8000-000000000301" }));
  assert.ok("error" in bad && /유튜브/.test(bad.error));
});
