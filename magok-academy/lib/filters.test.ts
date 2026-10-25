import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadDatasetFromDir } from "./dataset.ts";
import { EMPTY_FILTERS, activeFilterCount, applyFilters, areaOf, filtersFromParams, filtersToParams, type Filters } from "./filters.ts";

const { academies } = loadDatasetFromDir(path.join(import.meta.dirname, "..", "data", "sample"), { today: new Date("2026-10-24") }).dataset;
const ids = (f: Partial<Filters>, fav: string[] = []) => applyFilters(academies, { ...EMPTY_FILTERS, ...f }, fav).academies.map((a) => a.id);

test("필터 없음: 전체", () => {
  assert.deepEqual(ids({}), ["A001", "A002", "A003", "A004", "A005", "A006"]);
});

test("분야는 그룹 안 OR", () => {
  assert.deepEqual(ids({ categories: ["댄스"] }), ["A003", "A005"]);
  assert.deepEqual(ids({ categories: ["댄스", "연기"] }), ["A001", "A003", "A004", "A005"]);
  assert.deepEqual(ids({ categories: ["발레"] }), ["A006"]);
  assert.deepEqual(ids({ categories: ["댄스", "발레"] }), ["A003", "A005", "A006"]);
});

test("그룹 사이 AND", () => {
  assert.deepEqual(ids({ categories: ["보컬"], grades: ["중등"] }), ["A002"]);
});

test("수강료 구간: 범위가 겹치면 포함, 미확인은 제외하고 셈", () => {
  // A003은 12만~16만이라 두 구간 모두에 걸침
  assert.deepEqual(ids({ tuition: "lt15" }), ["A003", "A006"]);
  assert.deepEqual(ids({ tuition: "15to20" }), ["A001", "A002", "A003"]);
  assert.deepEqual(ids({ tuition: "gt20" }), ["A005"]);
  assert.deepEqual(applyFilters(academies, { ...EMPTY_FILTERS, tuition: "gt20" }).unknown, { tuition: 1, schedule: 0 });
});

test("요일·시간대는 같은 수업 칸에서 함께 맞아야 함", () => {
  assert.deepEqual(ids({ days: ["토"] }), ["A003", "A005"]);
  assert.deepEqual(ids({ times: ["evening"] }), ["A002", "A004"]);
  // A003: 토 10:00 수업(방과후 대) → 토+저녁은 없음
  assert.deepEqual(ids({ days: ["토"], times: ["evening"] }), []);
  assert.deepEqual(ids({ days: ["화"], times: ["afternoon"] }), ["A001", "A003"]);
  assert.deepEqual(ids({ days: ["월"], times: ["afternoon"] }), ["A006"]);
});

test("즐겨찾기만", () => {
  assert.deepEqual(ids({ favoritesOnly: true }, ["A004", "A002"]), ["A002", "A004"]);
  assert.deepEqual(ids({ favoritesOnly: true }), []);
});

test("URL 왕복, 잘못된 값은 버림", () => {
  const f: Filters = { areas: ["화곡", "발산"], categories: ["보컬", "연기"], grades: ["중등"], tuition: "15to20", days: ["화"], times: ["evening"], favoritesOnly: true };
  assert.deepEqual(filtersFromParams(filtersToParams(f)), f);
  assert.equal(activeFilterCount(f), 9);
  assert.deepEqual(filtersFromParams(new URLSearchParams("c=보컬,피아노&t=cheap&d=X")), { ...EMPTY_FILTERS, categories: ["보컬"] });
  // 필터 외 파라미터(v, sel)는 유지
  assert.equal(filtersToParams(EMPTY_FILTERS, new URLSearchParams("v=map&c=댄스")).toString(), "v=map");
});

test("주소 → 동네", () => {
  assert.equal(areaOf("서울 강서구 강서로18길 34 (화곡동 340-7)"), "화곡");
  assert.equal(areaOf("서울 강서구 수명로 72 (내발산동 750-6)"), "발산");
  assert.equal(areaOf("서울 강서구 외발산동 1"), "발산");
  assert.equal(areaOf("서울 강서구 마곡동 000-0"), "마곡");
  assert.equal(areaOf("서울 강서구 강서로54길 102 (등촌동 668-5)"), "등촌");
  assert.equal(areaOf("서울 강서구 양천로 104 (방화동 281-2)"), "방화");
  assert.equal(areaOf("서울 강서구 염창동 1"), null);
  assert.equal(areaOf(null), null);
});

test("동네 필터: 주소에서 동네를 못 찾으면 제외", () => {
  // 예시 데이터는 전부 마곡동
  assert.equal(ids({ areas: ["마곡"] }).length, 6);
  assert.deepEqual(ids({ areas: ["화곡"] }), []);
});
