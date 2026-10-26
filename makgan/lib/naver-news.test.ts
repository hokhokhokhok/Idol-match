import test from "node:test";
import assert from "node:assert/strict";
import { newsTotal } from "./naver-news.ts";

const keys = { id: "id", secret: "secret" };

test("검색 결과 total을 돌려주고 키는 헤더로만 보낸다", async () => {
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const n = await newsTotal("홍길동", keys, async (url, headers) => { seen = { url, headers }; return { total: 1234 }; });
  assert.equal(n, 1234);
  assert.ok(!seen!.url.includes("secret") && seen!.headers["X-Naver-Client-Secret"] === "secret");
  assert.ok(decodeURIComponent(seen!.url).includes("홍길동"));
});

test("오류·이상한 응답은 null", async () => {
  assert.equal(await newsTotal("a", keys, async () => { throw new Error("x"); }), null);
  assert.equal(await newsTotal("a", keys, async () => ({ total: "많음" })), null);
  assert.equal(await newsTotal("a", keys, async () => ({ total: -1 })), null);
});
