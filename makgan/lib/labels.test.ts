import { test } from "node:test";
import assert from "node:assert/strict";
import { uniqueLabels } from "./labels.ts";

test("겹치는 이름에만 번호를 붙임", () => {
  const out = uniqueLabels([{ value: "1", label: "라이어" }, { value: "2", label: "빨래" }, { value: "3", label: "라이어" }, { value: "4", label: "라이어" }]);
  assert.deepEqual(out.map((o) => o.label), ["라이어", "빨래", "라이어 (2)", "라이어 (3)"]);
  assert.deepEqual(out.map((o) => o.value), ["1", "2", "3", "4"]);
});
