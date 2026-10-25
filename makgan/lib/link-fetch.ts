import "server-only";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { isBlockedIp } from "./ssrf";
import { parseLinkMeta, type LinkMeta } from "./link-meta";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

/** 테스트 전용: 내부 주소라도 허용할 호스트(E2E의 로컬 가짜 페이지). 운영에는 설정하지 않는다. */
const allowHosts = () => (process.env.LINK_META_ALLOW_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

class LinkError extends Error {}

/** 접속 직전에 실제로 연결할 IP를 검사한다(DNS rebinding 방지) */
function guardedLookup(allowed: boolean): LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, cb: (...args: unknown[]) => void) => {
    dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return cb(err);
      const list = addresses as dns.LookupAddress[];
      // 하나라도 내부 주소면 거부(여러 주소 중 내부 주소로 붙는 것 방지)
      if (!list.length || (!allowed && list.some((a) => isBlockedIp(a.address)))) return cb(new LinkError("blocked address"));
      if (options.all) return cb(null, list);
      cb(null, list[0].address, list[0].family);
    });
  }) as unknown as LookupFunction;
}

function validate(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new LinkError("bad url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new LinkError("protocol");
  if (u.username || u.password) throw new LinkError("credentials");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowed = allowHosts().includes(host);
  if (!allowed && u.port && u.port !== "80" && u.port !== "443") throw new LinkError("port");
  if (!allowed && (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal"))) throw new LinkError("blocked host");
  if (isIP(host) && !allowed && isBlockedIp(host)) throw new LinkError("blocked address");
  return { u, allowed };
}

function charsetOf(contentType: string, head: Buffer) {
  const fromHeader = contentType.match(/charset=([\w-]+)/i)?.[1];
  const fromMeta = head.toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  const cs = (fromHeader ?? fromMeta ?? "utf-8").toLowerCase();
  try { return new TextDecoder(cs); } catch { return new TextDecoder("utf-8"); }
}

function getOnce(u: URL, allowed: boolean, deadline: number): Promise<{ status: number; location?: string; html?: string }> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.get(u, {
      lookup: guardedLookup(allowed),
      headers: { "user-agent": "MakganLinkPreview/1.0", accept: "text/html,application/xhtml+xml", "accept-language": "ko,en;q=0.5" },
      timeout: Math.max(1, deadline - Date.now()),
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ status, location: res.headers.location });
      }
      const type = String(res.headers["content-type"] ?? "");
      if (status !== 200 || !/text\/html|application\/xhtml/i.test(type)) {
        res.resume();
        return reject(new LinkError(`status ${status} ${type}`));
      }
      if (Number(res.headers["content-length"] ?? 0) > MAX_BYTES) { res.destroy(); return reject(new LinkError("too large")); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { res.destroy(); reject(new LinkError("too large")); return; }
        chunks.push(c);
      });
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status, html: charsetOf(type, buf.subarray(0, 2048)).decode(buf) });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new LinkError("timeout")));
    req.on("error", reject);
    const timer = setTimeout(() => req.destroy(new LinkError("timeout")), Math.max(1, deadline - Date.now()));
    req.on("close", () => clearTimeout(timer));
  });
}

/** 링크의 제목·사이트 이름·이미지. 실패하면 null(조용히 수동 입력으로) */
export async function fetchLinkMeta(raw: string): Promise<(LinkMeta & { url: string; host: string }) | null> {
  const deadline = Date.now() + TIMEOUT_MS;
  try {
    let url = raw.trim();
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const { u, allowed } = validate(url);
      const r = await getOnce(u, allowed, deadline);
      if (r.location) { url = new URL(r.location, u).href; continue; }
      return { ...parseLinkMeta(r.html ?? "", u.href), url: u.href, host: u.hostname };
    }
    return null;
  } catch {
    return null;
  }
}
