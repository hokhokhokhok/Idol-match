/** 로그인 후 돌아갈 경로. 외부 주소로 튀지 않게 같은 사이트의 경로만 허용한다. */
export function safeNext(next: unknown, fallback = "/") {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
