import test from "node:test";
import assert from "node:assert/strict";
import { initialOf, isInitial, initialLabel } from "./initials.ts";

test("한글 첫소리로 묶고 쌍자음은 합친다", () => {
  assert.equal(initialOf("김현진"), "ㄱ");
  assert.equal(initialOf("까치"), "ㄱ");
  assert.equal(initialOf("나"), "ㄴ");
  assert.equal(initialOf("따라"), "ㄷ");
  assert.equal(initialOf("빵"), "ㅂ");
  assert.equal(initialOf("쏘"), "ㅅ");
  assert.equal(initialOf("이승준"), "ㅇ");
  assert.equal(initialOf("짜"), "ㅈ");
  assert.equal(initialOf("최"), "ㅊ");
  assert.equal(initialOf("카"), "ㅋ");
  assert.equal(initialOf("타"), "ㅌ");
  assert.equal(initialOf("팡"), "ㅍ");
  assert.equal(initialOf("홍길동"), "ㅎ");
  assert.equal(initialOf("힣"), "ㅎ");
});

test("알파벳·그 밖", () => {
  assert.equal(initialOf("John"), "A");
  assert.equal(initialOf("zed"), "A");
  assert.equal(initialOf("[샘플] 배우"), "#");
  assert.equal(initialOf("1호"), "#");
  assert.equal(initialOf(""), "#");
});

test("라벨·검사", () => {
  assert.equal(initialLabel("A"), "A–Z");
  assert.equal(initialLabel("#"), "기타");
  assert.ok(isInitial("ㄱ") && !isInitial("ㄲ") && !isInitial(null));
});
