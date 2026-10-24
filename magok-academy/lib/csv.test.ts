import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseCsvRows, splitList } from "./csv.ts";

test("따옴표 안의 쉼표·줄바꿈·이스케이프", () => {
  const rows = parseCsvRows('a,b,c\n1,"x, y","say ""hi""\nnext"\n');
  assert.deepEqual(rows.map((r) => r.cells), [["a", "b", "c"], ["1", "x, y", 'say "hi"\nnext']]);
});

test("BOM·CRLF·빈 줄·빈 칸", () => {
  const t = parseCsv("﻿id,name\r\nA1,\r\n\r\nA2,이름\r\n");
  assert.deepEqual(t.header, ["id", "name"]);
  assert.deepEqual(t.rows.map((r) => r.values), [{ id: "A1", name: "" }, { id: "A2", name: "이름" }]);
  assert.deepEqual(t.rows.map((r) => r.line), [2, 4]);
});

test("칸이 모자란 행은 빈 값으로 채움", () => {
  assert.deepEqual(parseCsv("a,b,c\n1\n").rows[0].values, { a: "1", b: "", c: "" });
});

test("닫히지 않은 따옴표는 오류", () => {
  assert.throws(() => parseCsvRows('a\n"oops\n'));
});

test("세미콜론 배열", () => {
  assert.deepEqual(splitList("보컬; 연기;;"), ["보컬", "연기"]);
  assert.deepEqual(splitList(""), []);
});
