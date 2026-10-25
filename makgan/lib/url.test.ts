import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./url.ts";

test("같은 사이트 경로는 그대로", () => {
  assert.equal(safeNext("/me"), "/me");
  assert.equal(safeNext("/shows/1?tab=cast"), "/shows/1?tab=cast");
});

test("외부로 튀는 값은 홈으로", () => {
  for (const v of ["https://evil.com", "//evil.com", "/\\evil.com", "/\\/evil.com", "/%0d", "evil", "", null, undefined, 1]) {
    const out = safeNext(v);
    assert.ok(out === "/" || out === "/%0d", String(v));
  }
  assert.equal(safeNext("/\tevil"), "/");
  assert.equal(safeNext("//x", "/me"), "/me");
});
