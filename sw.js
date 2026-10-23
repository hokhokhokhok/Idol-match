// 앱 셸은 cache-first, 데이터(idols.json)는 stale-while-revalidate, 구글 폰트는 런타임 cache-first.
// 파일을 바꿔 배포할 때는 VERSION을 올린다.
const VERSION = "v3";
const SHELL = `im-shell-${VERSION}`;
const DATA = `im-data-${VERSION}`;
const FONTS = `im-fonts-${VERSION}`;
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=IBM+Plex+Sans+KR:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap";
const SHELL_FILES = ["./", "index.html", "js/score.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(SHELL_FILES);
    await (await caches.open(DATA)).add("data/idols.json");
    // 폰트 CSS는 실패해도 설치를 막지 않는다(시스템 글꼴로 대체됨).
    try { await (await caches.open(FONTS)).add(FONT_CSS); } catch (_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keep = [SHELL, DATA, FONTS];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: name === SHELL });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 같은 사이트 하위 경로에 배포된 다른 앱(민법 모의고사, 조문 암기)은 그 앱의 서비스워커가 처리한다.
  if (url.origin === location.origin && /\/(civil-exam|jomun)(\/|$)/.test(url.pathname)) return;
  if (url.origin === location.origin) {
    if (url.pathname.endsWith("/data/idols.json")) return e.respondWith(staleWhileRevalidate(req, DATA));
    if (req.mode === "navigate") {
      return e.respondWith(caches.open(SHELL).then(c => c.match("index.html")).then(hit => hit || fetch(req)));
    }
    return e.respondWith(cacheFirst(req, SHELL));
  }
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    return e.respondWith(cacheFirst(req, FONTS));
  }
});
