import { test } from "node:test";
import assert from "node:assert/strict";
import { castNames, kopisDate, kopisError, parseDbs, parseDetail, parseFacility, parseList, posterHttps } from "./kopis.ts";

const LIST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dbs>
<db><mt20id>PF304064</mt20id><prfnm>푸른사자 와니니 [나주]</prfnm><prfpdfrom>2026.10.31</prfpdfrom><prfpdto>2026.10.31</prfpdto><fcltynm>나주문화예술회관</fcltynm><poster>http://www.kopis.or.kr/upload/pfmPoster/PF_PF304064.png</poster><area>전남</area><genrenm>뮤지컬</genrenm><openrun>N</openrun><prfstate>공연예정</prfstate></db>
<db><mt20id>PF1</mt20id><prfnm>날짜 없음</prfnm><prfpdfrom></prfpdfrom><prfpdto></prfpdto></db>
<db><mt20id>PF2</mt20id><prfnm>Tom &amp; Jerry</prfnm><prfpdfrom>2026.11.02</prfpdfrom><prfpdto>2026.10.01</prfpdto></db>
</dbs>`;

test("목록: 정상 항목만, 포스터는 https", () => {
  const items = parseList(LIST);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { id: "PF304064", title: "푸른사자 와니니 [나주]", startsOn: "2026-10-31", endsOn: "2026-10-31", posterUrl: "https://kopis.or.kr/upload/pfmPoster/PF_PF304064.png", facilityName: "나주문화예술회관", genre: "뮤지컬", state: "공연예정" });
});

test("엔티티·CDATA", () => {
  const r = parseDbs(`<dbs><db><a>Tom &amp; Jerry &#44; &lt;3</a><b><![CDATA[<b>굵게</b>]]></b></db></dbs>`)[0];
  assert.equal(r.a, "Tom & Jerry , <3");
  assert.equal(r.b, "<b>굵게</b>");
});

test("날짜·포스터", () => {
  assert.equal(kopisDate("2026.10.31"), "2026-10-31");
  assert.equal(kopisDate("2026-10-31"), null);
  assert.equal(kopisDate(undefined), null);
  assert.equal(posterHttps("http://www.kopis.or.kr/a.png"), "https://kopis.or.kr/a.png");
  assert.equal(posterHttps("http://example.com/a.png"), "https://example.com/a.png");
  assert.equal(posterHttps("javascript:alert(1)"), null);
  assert.equal(posterHttps(" "), null);
});

test("출연진 이름 정리", () => {
  assert.deepEqual(castNames("홍길동, 김철수 등"), ["홍길동", "김철수"]);
  assert.deepEqual(castNames("홍길동(프레디), 김철수 (잭) 외 3명"), ["홍길동", "김철수"]);
  assert.deepEqual(castNames("홍길동, 홍길동, 이영희"), ["홍길동", "이영희"]);
  assert.deepEqual(castNames(" "), []);
  assert.deepEqual(castNames("출연진 미정, 추후 공개"), []);
  assert.deepEqual(castNames("가".repeat(31) + ", 나나"), ["나나"]);
  assert.equal(castNames(Array.from({ length: 100 }, (_, i) => `배우${i}번`).join(",")).length, 40);
});

const DETAIL = `<dbs><db><mt20id>PF304064</mt20id><mt13id>FC000485-01</mt13id><prfnm>x</prfnm><prfcast>홍길동, 김철수 등</prfcast><poster>http://www.kopis.or.kr/p.png</poster><sty>[공연소개]

이현 작가의 원작 소설을 뮤지컬로!</sty><mt10id>FC000485</mt10id><styurls><styurl>http://a/b.png</styurl></styurls><relates><relate><relatenm>네이버N예약</relatenm><relateurl>https://booking.naver.com/booking/12/bizes/1?a=1&amp;b=2</relateurl></relate></relates></db></dbs>`;

test("상세: 소개·출연진·극장 id·예매 링크", () => {
  const d = parseDetail(DETAIL)!;
  assert.equal(d.synopsis, "이현 작가의 원작 소설을 뮤지컬로!");
  assert.deepEqual(d.cast, ["홍길동", "김철수"]);
  assert.equal(d.facilityId, "FC000485");
  assert.equal(d.ticketUrl, "https://booking.naver.com/booking/12/bizes/1?a=1&b=2");
  assert.equal(d.ticketName, "네이버N예약");
  assert.equal(parseDetail("<dbs></dbs>"), null);
  const bad = parseDetail(`<dbs><db><mt20id>P</mt20id><relates><relate><relatenm>x</relatenm><relateurl>javascript:alert(1)</relateurl></relate></relates></db></dbs>`)!;
  assert.equal(bad.ticketUrl, null);
  assert.equal(bad.ticketName, null);
});

test("극장: 중첩된 같은 이름 태그는 바깥 값, 좌표·지도 링크", () => {
  const f = parseFacility(`<dbs><db><fcltynm>나주문화예술회관</fcltynm><mt10id>FC000485</mt10id><seatscale>548</seatscale><adres>전남 나주시 예향로 4137</adres><la>35.0224762</la><lo>126.7123953</lo><mt13s><mt13><seatscale>10</seatscale></mt13></mt13s></db></dbs>`)!;
  assert.equal(f.seatCount, 548);
  assert.equal(f.address, "전남 나주시 예향로 4137");
  assert.equal(f.lat, 35.0224762);
  assert.equal(f.mapUrl, "https://map.kakao.com/link/map/%EB%82%98%EC%A3%BC%EB%AC%B8%ED%99%94%EC%98%88%EC%88%A0%ED%9A%8C%EA%B4%80,35.0224762,126.7123953");
  const noGeo = parseFacility(`<dbs><db><fcltynm>극장</fcltynm><seatscale>0</seatscale><la>0</la><lo>0</lo></db></dbs>`)!;
  assert.deepEqual([noGeo.seatCount, noGeo.lat, noGeo.mapUrl, noGeo.address], [null, null, null, null]);
  assert.equal(parseFacility("<dbs></dbs>"), null);
});

test("KOPIS 오류 응답 감지", () => {
  assert.equal(kopisError(`<dbs><db><returncode>01</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR.</errmsg></db></dbs>`), "KOPIS 오류 01: SERVICE KEY IS NOT REGISTERED ERROR.");
  assert.equal(kopisError(LIST), null);
  assert.equal(kopisError("<dbs></dbs>"), null);
});
