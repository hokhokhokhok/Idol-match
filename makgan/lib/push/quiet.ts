// 방해금지 시간(KST) 판단 — 'HH:MM' 또는 'HH:MM:SS'. 시작>끝이면 자정을 넘는 구간(23:00~08:00)
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function isQuietTime(now: Date, start: string, end: string): boolean {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  const cur = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return false;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}
