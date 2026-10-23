const test = require("node:test");
const assert = require("node:assert/strict");
const { score, why, TYPES, GOLD } = require("../js/score.js");

test("같은 유형: 축 보완 없이 기본점 + 동일 유형 보너스 3점", () => {
  // N 같음 26 + E 같음 10 + F 같음 16 + P 같음 10 + 동일 3
  assert.equal(score("ENFP", "ENFP"), 65);
  // S 같음 26 + I 같음 10 + T 같음 16 + J 같음 10 + 동일 3
  assert.equal(score("ISTJ", "ISTJ"), 65);
});

test("찰떡 조합: 모든 축 조건 + 찰떡 보너스 14점 = 89점", () => {
  assert.equal(score("ENFP", "INFJ"), 89);
  assert.equal(score("INFJ", "ENFP"), 89);
  assert.equal(score("ESTP", "ISTJ"), 89);
  assert.match(why("ENFP", "INFJ", "ko"), /찰떡/);
  assert.match(why("ENFP", "INFJ", "en"), /perfect match/);
});

test("정반대 유형: S/N·T/F 불일치, E/I·J/P 보완 = 49점", () => {
  // N≠S 6 + E≠I 18 + F≠T 10 + P≠J 15
  assert.equal(score("ENFP", "ISTJ"), 49);
  assert.equal(score("INTJ", "ESFP"), 49);
});

test("모든 조합이 36~89점 범위, 찰떡 조합은 64점 이상", () => {
  for (const a of TYPES) {
    const scores = TYPES.map(b => score(a, b));
    for (const s of scores) assert.ok(s >= 36 && s <= 89, `${a}: ${s}`);
    for (const g of GOLD[a]) assert.ok(score(a, g) >= 64, `${a}-${g}: ${score(a, g)}`);
  }
});
