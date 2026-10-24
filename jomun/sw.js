// 조문 암기 트레이너 서비스 워커: 앱 파일 전부 cache-first(오프라인 동작). 파일을 바꿔 배포할 때는 VERSION을 올린다.
const VERSION = "v3";
const CACHE = `jomun-${VERSION}`;
const FILES = ["./", "index.html", "js/core.js", "data/pack.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    // 같은 사이트의 다른 앱 캐시(im-*, 민법 모의고사 등)는 건드리지 않고 이 앱의 옛 버전만 지운다.
    for (const k of await caches.keys()) if (k.startsWith("jomun-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === "navigate") return (await cache.match("index.html")) || fetch(req);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
