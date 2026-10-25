import { test } from "node:test";
import assert from "node:assert/strict";
import { isQuietTime } from "./quiet.ts";

const at = (kstHHMM: string) => new Date(`2026-11-03T${kstHHMM}:00+09:00`);

test("자정을 넘는 기본 구간 23:00~08:00", () => {
  assert.equal(isQuietTime(at("22:59"), "23:00", "08:00"), false);
  assert.equal(isQuietTime(at("23:00"), "23:00", "08:00"), true);
  assert.equal(isQuietTime(at("03:00"), "23:00:00", "08:00:00"), true);
  assert.equal(isQuietTime(at("07:59"), "23:00", "08:00"), true);
  assert.equal(isQuietTime(at("08:00"), "23:00", "08:00"), false);
});

test("같은 날 구간, 시작=끝이면 끔", () => {
  assert.equal(isQuietTime(at("13:30"), "13:00", "14:00"), true);
  assert.equal(isQuietTime(at("14:00"), "13:00", "14:00"), false);
  assert.equal(isQuietTime(at("03:00"), "00:00", "00:00"), false);
});
