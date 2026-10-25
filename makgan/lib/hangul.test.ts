import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf } from "./hangul.ts";

test("가나다 묶음", () => {
  assert.equal(groupOf("커튼콜"), "ㅋ");
  assert.equal(groupOf("막공"), "ㅁ");
  assert.equal(groupOf("까치석"), "ㄱ");
  assert.equal(groupOf("씬스틸러"), "ㅅ");
  assert.equal(groupOf("[샘플] 용어"), "ㅇ");
  assert.equal(groupOf("OST"), "A-Z");
  assert.equal(groupOf("1층"), "기타");
});
