import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinkMeta } from "./link-meta.ts";

test("og 태그 우선, 속성 순서·따옴표·엔티티", () => {
  const html = `<html><head><title>기본 제목</title>
    <meta content='로터리 &amp; 할인 안내' property="og:title">
    <meta property="og:site_name" content="[샘플] 공식 SNS" />
    <meta property="og:image" content="/img/poster.jpg"></head></html>`;
  assert.deepEqual(parseLinkMeta(html, "https://example.com/news/1"), { title: "로터리 & 할인 안내", siteName: "[샘플] 공식 SNS", image: "https://example.com/img/poster.jpg" });
});

test("og:title 없으면 <title>, 이미지 주소 검사", () => {
  const r = parseLinkMeta(`<title>\n  공연  소식 &#8211; 막간 </title><meta property="og:image" content="javascript:alert(1)">`, "https://example.com");
  assert.equal(r.title, "공연 소식 – 막간");
  assert.equal(r.image, null);
  assert.equal(r.siteName, null);
});

test("아무것도 없으면 null", () => {
  assert.deepEqual(parseLinkMeta("<p>hi</p>", "https://example.com"), { title: null, siteName: null, image: null });
});
