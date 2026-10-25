// 링크 미리보기: HTML에서 <title>, og:title, og:site_name, og:image만 읽는다(SPEC-2 B-4). 날짜는 읽지 않는다.
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9#]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#") && k !== "#39") return String.fromCodePoint(Number(k.slice(1)));
    return ENTITIES[k] ?? m;
  }).replace(/\s+/g, " ").trim();

function meta(html: string, prop: string) {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (key !== prop) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (content) return decode(content);
  }
  return null;
}

export type LinkMeta = { title: string | null; siteName: string | null; image: string | null };

export function parseLinkMeta(html: string, baseUrl: string): LinkMeta {
  const head = html.slice(0, 500_000);
  const title = meta(head, "og:title") ?? (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]) : null);
  const rawImage = meta(head, "og:image");
  let image: string | null = null;
  if (rawImage) {
    try {
      const u = new URL(rawImage, baseUrl);
      if (u.protocol === "https:" || u.protocol === "http:") image = u.href;
    } catch { /* 무시 */ }
  }
  return { title: title ? title.slice(0, 200) : null, siteName: meta(head, "og:site_name")?.slice(0, 100) ?? null, image };
}
