import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { escapeCell, parseCsvRows, toCsv } from "./csv.ts";
import { buildDataset, loadDatasetFromDir } from "./dataset.ts";
import { datasetToCsv } from "./serialize.ts";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");

test("escapeCell", () => {
  assert.equal(escapeCell("plain"), "plain");
  assert.equal(escapeCell("a,b"), '"a,b"');
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCell("line\nbreak"), '"line\nbreak"');
});

test("toCsv → parse 왕복", () => {
  const text = toCsv(["a", "b"], [{ a: "x, y", b: 'q"q' }, { a: "", b: "z" }]);
  assert.deepEqual(parseCsvRows(text).map((r) => r.cells), [["a", "b"], ["x, y", 'q"q'], ["", "z"]]);
});

test("샘플 데이터: 직렬화 후 다시 읽어도 같은 데이터", () => {
  const today = new Date("2026-10-24T00:00:00Z");
  const original = loadDatasetFromDir(DATA_DIR, { today });
  const again = buildDataset(datasetToCsv(original.dataset), { today });
  assert.deepEqual(again.dataset, original.dataset);
  assert.deepEqual(again.issues.filter((i) => i.level === "error"), []);
});
