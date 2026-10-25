// 막간 서비스 워커: 웹 푸시 표시와 알림 누르면 해당 화면 열기(SPEC-2 B-2)
self.addEventListener("push", (event) => {
  let data = { title: "막간", body: "", url: "/" };
  try { data = { ...data, ...event.data.json() }; } catch { if (event.data) data.body = event.data.text(); }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url }, lang: "ko" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = all.find((c) => c.url === url);
    if (same) return same.focus();
    return self.clients.openWindow(url);
  })());
});
