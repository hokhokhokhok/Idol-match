import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeId } from "./youtube.ts";

const ID = "dQw4w9WgXcQ";

test("여러 형태의 유튜브 주소", () => {
  for (const u of [ID, `https://www.youtube.com/watch?v=${ID}&t=10`, `https://youtu.be/${ID}?si=x`, `https://m.youtube.com/watch?v=${ID}`,
    `https://youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`, `https://www.youtube-nocookie.com/embed/${ID}`, `  ${ID}  `]) {
    assert.equal(parseYouTubeId(u), ID, u);
  }
});

test("유튜브가 아니거나 잘못된 id", () => {
  for (const u of ["", "abc", `https://evil.com/watch?v=${ID}`, `javascript:alert('${ID}')`, "https://youtube.com/watch?v=short", `https://youtube.com/channel/${ID}`]) {
    assert.equal(parseYouTubeId(u), null, u);
  }
});
