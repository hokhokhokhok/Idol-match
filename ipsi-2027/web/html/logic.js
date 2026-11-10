// ipsi-2027 계산 로직 (Python engine/*.py 이식). 브라우저·node 공용.
(function (root) {
  "use strict";
  const sum = a => a.reduce((x, y) => x + y, 0);
  function* combinations(arr, k, start = 0, acc = []) {
    if (acc.length === k) { yield acc.slice(); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); yield* combinations(arr, k, i + 1, acc); acc.pop(); }
  }

  // ---------------- 수능 최저 (engine/minreq.py)
  function inqValues(rule, s) {
    const allowed = ["탐1", "탐2"].filter(k => s.grades[k] != null && (!rule.inq_type || s.inqTypes[k] === rule.inq_type));
    if (!allowed.length) return `${rule.inq_type || "탐구"} 응시 과목 없음`;
    const vals = {}; allowed.forEach(k => vals[k] = +s.grades[k]);
    const pool = rule.pool || [];
    if (pool.includes("탐1") || pool.includes("탐2")) return vals;
    const mode = rule.inq || "best1";
    if (mode === "avg2" || mode === "avg2_or_sci1") {
      if (allowed.length < 2) return "탐구 2과목 평균 기준인데 해당 과목이 2개 미만";
      let v = sum(Object.values(vals)) / 2;
      const r = rule.inq_round || "none";
      v = r === "floor" ? Math.floor(v) : r === "ceil" ? Math.ceil(v) : v;
      if (mode === "avg2_or_sci1") {
        const sci = allowed.filter(k => s.inqTypes[k] === "과탐").map(k => vals[k]);
        if (sci.length) v = Math.min(v, ...sci);
      }
      return { "탐": v };
    }
    return { "탐": Math.min(...Object.values(vals)) };
  }
  function checkRule(rule, s) {
    if (rule.any_of) {
      const rs = rule.any_of.map(r => checkRule(r, s));
      const best = rs.find(r => r.ok);
      if (best) return { ok: true, detail: "택1 기준 중 하나 충족: " + best.detail, margin: best.margin };
      const ms = rs.map(r => r.margin).filter(m => m != null);
      return { ok: false, detail: "택1 기준 모두 미충족 — " + rs.map(r => r.detail).join(" / "), margin: ms.length ? Math.max(...ms) : null };
    }
    if (rule.eng_12 && s.grades["영"] === 2) s = { ...s, grades: { ...s.grades, "영": 1 } };
    if (rule.math && s.math && !rule.math.includes(s.math)) return { ok: false, detail: `수학 선택과목 조건(${rule.math.join("/")}) 불일치` };
    const fails = [];
    for (const [a, lim] of Object.entries(rule.extra || {})) {
      const g = s.grades[a];
      if (g == null) fails.push(`${a} 성적 없음`); else if (g > lim) fails.push(`${a} ${g}등급 > ${lim}등급`);
    }
    const pool = rule.pool;
    if (!pool) return { ok: !fails.length, detail: fails.join("; ") || "별도 조건 충족" };
    const inq = inqValues(rule, s);
    if (typeof inq === "string") return { ok: false, detail: inq };
    const values = {};
    for (const a of pool) {
      if (a === "탐") { if (inq["탐"] != null) values["탐"] = inq["탐"]; }
      else if (a === "탐1" || a === "탐2") { if (inq[a] != null) values[a] = inq[a]; }
      else if (s.grades[a] != null) values[a] = +s.grades[a];
    }
    const pick = rule.pick, smax = rule.sum_max, emax = rule.each_max;
    const any = new Set(rule.must_any || []), all = new Set(rule.must_all || []);
    let best = null, bestSum = null;
    for (const c of combinations(Object.keys(values), pick)) {
      const cs = new Set(c);
      if (any.size && ![...any].some(x => cs.has(x))) continue;
      if (all.size && ![...all].every(x => cs.has(x))) continue;
      if (emax != null && c.some(a => values[a] > emax)) continue;
      const t = sum(c.map(a => values[a]));
      if (bestSum == null || t < bestSum) { best = c; bestSum = t; }
    }
    if (!best) return { ok: false, detail: `${pick}개 영역${emax != null ? ` 각 ${emax}등급 이내` : ""} 조건을 만족하는 조합 없음` + (fails.length ? "; " + fails.join("; ") : "") };
    const desc = best.map(a => `${a}(${+values[a].toFixed(2)})`).join("+") + "=" + +bestSum.toFixed(2);
    let margin = null;
    if (smax != null) { margin = smax - bestSum; if (bestSum > smax) fails.unshift(`최선 조합 ${desc} > ${smax}`); }
    if (fails.length) return { ok: false, detail: fails.join("; "), margin };
    return { ok: true, detail: `최선 조합 ${desc}` + (smax != null ? ` (기준 ${smax} 이내)` : ""), margin };
  }
  function judge(rule, ranges, inqTypes, math) {
    if (!rule) return { status: "기준 없음", swing: [] };
    const opt = { grades: {}, inqTypes: inqTypes || {}, math }, pes = { grades: {}, inqTypes: inqTypes || {}, math };
    for (const [k, v] of Object.entries(ranges)) { opt.grades[k] = v[0]; pes.grades[k] = v[1]; }
    const co = checkRule(rule, opt), cp = checkRule(rule, pes);
    if (co.ok && cp.ok) return { status: "충족", opt: co, pes: cp, swing: [] };
    if (!co.ok) return { status: "미충족", opt: co, pes: cp, swing: [] };
    const swing = [];
    for (const [k, [a, b]] of Object.entries(ranges)) {
      if (a === b) continue;
      const g = { ...opt.grades, [k]: b };
      if (!checkRule(rule, { ...opt, grades: g }).ok) swing.push(k);
    }
    return { status: "경계", opt: co, pes: cp, swing };
  }

  // ---------------- 정시 환산 (engine/conversion.py)
  function inq(part, sc, f, maxes, res) {
    const n = part.n || 2, metric = part.metric, b = f.bonus || {};
    const vals = [];
    for (const k of ["탐1", "탐2"]) {
      const s = sc[k]; if (!s) continue;
      let v;
      if (metric === "conv" || metric === "std_max") {
        v = s.conv; if (v == null) { v = s.std; if (v != null) res.provisional.add("탐구 변환표준점수 미발표 → 표준점수로 임시 계산"); }
      } else v = s[metric];
      if (v == null) continue;
      const t = s.type;
      v = v * (1 + ((b.inq_pct || {})[t] || 0) / 100) + ((b.inq_add || {})[t] || 0);
      vals.push([v, t]);
    }
    if (vals.length < n) { res.missing.add(`탐구 ${n}과목 점수 필요`); return null; }
    vals.sort((x, y) => y[0] - x[0]);
    const top = vals.slice(0, n);
    let total = sum(top.map(x => x[0]));
    if (b.inq_all && n >= 2 && top.every(x => x[1] === b.inq_all.type)) total *= 1 + b.inq_all.pct / 100;
    if (metric === "std_max") {
      if (!maxes["탐"]) { res.missing.add("탐구 최고 변환표준점수 입력 필요"); return null; }
      return total / (maxes["탐"] * n);
    }
    return part.avg ? total / n : total;
  }
  function value(part, sc, f, maxes, res) {
    const area = part.area, metric = part.metric;
    if (area === "탐") return inq(part, sc, f, maxes, res);
    const s = sc[area] || {};
    if (metric === "grade_table") {
      if (s.grade == null) { res.missing.add(`${area} 등급 필요`); return null; }
      return part.table[s.grade - 1];
    }
    let v = s[["std", "conv", "std_max"].includes(metric) ? "std" : metric];
    if (v == null) { res.missing.add(`${area} ${metric === "pct" ? "백분위" : "표준점수"} 필요`); return null; }
    const b = f.bonus || {};
    if (area === "수" && b.math_pct && (b.math_in || []).includes(sc._math)) v = v * (1 + b.math_pct / 100);
    if (metric === "std_max") {
      if (!maxes[area]) { res.missing.add(`${area} 최고 표준점수 입력 필요`); return null; }
      return v / maxes[area];
    }
    return v;
  }
  function partMax(p) {
    if (p.metric === "grade_table") return Math.max(...p.table);
    if (p.metric === "std_max") return 1;
    const per = (p.area === "탐" || p.metric === "pct") ? 100 : 200;
    return p.area === "탐" ? (p.avg ? per : per * (p.n || 2)) : per;
  }
  const r3 = x => Math.round(Number((x * 1000).toPrecision(12))) / 1000;
  function computeOne(f, sc, maxes) {
    const res = { score: null, max: null, provisional: new Set(), missing: new Set(), variant: f.label || "" };
    if (f.approx) res.provisional.add("근사식: " + f.approx);
    let total = 0, tmax = 0;
    for (const p of f.parts) {
      const v = value(p, sc, f, maxes, res); if (v == null) continue;
      const c = p.coef == null ? 1 : p.coef; total += v * c; tmax += partMax(p) * c;
    }
    if (res.missing.size) return res;
    const den = f.den, scale = f.scale == null ? 1 : f.scale;
    let conv = den ? total * scale / den : total * scale;
    let cmax = f.max || (den ? tmax * scale / den : tmax * scale);
    for (const post of f.post || []) {
      const g = (sc[post.area] || {}).grade;
      if (g == null) { res.missing.add(`${post.area} 등급 필요`); return res; }
      const v = post.table[g - 1];
      if (post.op === "add") { conv += v; cmax += Math.max(...post.table); } else conv -= v;
    }
    const r = f.ratio == null ? 1 : f.ratio;
    res.score = r3(conv * r); res.max = r3(cmax * r);
    return res;
  }
  function compute(f, sc, maxes) {
    maxes = maxes || {};
    if (f.best_of) {
      const rs = f.best_of.map(x => computeOne(x, sc, maxes));
      const ok = rs.filter(r => r.score != null);
      if (!ok.length) return rs[0];
      return ok.reduce((a, b) => b.score > a.score ? b : a);
    }
    return computeOne(f, sc, maxes);
  }

  // ---------------- 합격 가능성 (engine/admission.py)
  const FACTORS = {
    nsu: { label: "N수생 증가", shift: 0.2, weight: 1.0, evidence: "🟡 보도 확인 — 졸업생 지원자 173,706명(+8.6%)", note: "이동폭 0.2점은 근거 수치가 없는 가정값" },
    stable: { label: "개편 전 마지막 해 안정 지원", shift: 0.2, weight: 0.0, evidence: "🔴 원출처 미확인 — 반대 신호 보도", note: "기본 꺼짐" },
  };
  const THRESH = { "안정": 0.5, "적정": -0.5, "소신": -1.5 };
  function gradeOf(z, t) { t = t || THRESH; return z >= t["안정"] ? "안정" : z >= t["적정"] ? "적정" : z >= t["소신"] ? "소신" : "위험"; }
  function myPctAvg(rec, pct) {
    const w = rec.weights; const ks = Object.keys(w); if (!ks.length) return null;
    return sum(ks.map(k => w[k] * pct[k])) / sum(ks.map(k => w[k]));
  }
  function assess(rec, pct, eng, factors, q27, carry, comp, thresh, prev) {
    const my = myPctAvg(rec, pct); if (my == null) return null;
    const shifts = [];
    for (const v of Object.values(factors || FACTORS)) { const s = v.shift * v.weight; if (s) shifts.push([v.label, s]); }
    const q = (q27 || rec.quota) + (carry || 0);
    if (rec.quota && q !== rec.quota) { const d = (q - rec.quota) / rec.quota * 100; shifts.push([`모집인원 ${rec.quota}→${q}명(${d >= 0 ? "+" : ""}${d.toFixed(0)}%)`, -0.01 * d]); }
    if (comp) shifts.push([`경쟁률 변화 ${comp}%`, 0.005 * comp]);
    const adj = rec.avg + sum(shifts.map(x => x[1]));
    const sd = Math.max(rec.sd, 0.5), z = (my - adj) / sd;
    const warns = [];
    if (rec.eng && eng - rec.eng >= 1) warns.push(`영어 ${eng}등급 — 합격자 평균 ${rec.eng}등급보다 낮아 실제로 불리할 수 있음`);
    if (rec.sd < 0.5) warns.push(`표준편차 ${rec.sd} → 0.5로 보정`);
    if (rec.quota && rec.quota < 10) warns.push(`${rec.quota}명 소수 모집 — 변동이 큼`);
    return { my, adj, sd, z, grade: gradeOf(z, thresh), shifts, warns, trend: prev ? rec.avg - prev.avg : null };
  }

  // ---------------- 조합 (engine/combo.py)
  const P_DEFAULT = { "안정": 0.85, "적정": 0.6, "소신": 0.3, "위험": 0.1 };
  const PRESETS = { "균형": { "안정": 1, "적정": 1, "소신": 1 }, "안정 우선": { "안정": 2, "적정": 1 }, "상향 허용": { "적정": 1, "소신": 2 } };
  function evaluate(cards, target, p, nPref) {
    let pf = 1; cards.forEach(c => pf *= 1 - p[c.grade]);
    let exp = 0, miss = 1;
    [...cards].sort((a, b) => a.pref - b.pref).forEach(c => { exp += miss * p[c.grade] * ((nPref - c.pref + 1) / nPref); miss *= 1 - p[c.grade]; });
    let mismatch = 0;
    for (const g of Object.keys(P_DEFAULT)) mismatch += Math.abs((target[g] || 0) - cards.filter(c => c.grade === g).length);
    const warns = [];
    if (pf > 0.3) warns.push(`전부 불합격 확률 ${(pf * 100).toFixed(0)}% (가정값 기준) — 안정 카드 보강을 고려하세요`);
    if (!cards.some(c => c.grade === "안정")) warns.push("안정 카드가 없습니다");
    if (cards.length < 3) warns.push(`${3 - cards.length}개 군을 비워 둔 조합입니다`);
    return { cards, pf, exp, mismatch, warns };
  }
  function recommend(cands, preset, p, top, currentPref) {
    p = p || P_DEFAULT; top = top || 3;
    const pool = cands.filter(c => currentPref == null || c.pref < currentPref);
    const nPref = Math.max(1, ...pool.map(c => c.pref));
    const opts = ["가", "나", "다"].map(g => [...pool.filter(c => c.group === g), null]);
    const out = [];
    for (const a of opts[0]) for (const b of opts[1]) for (const c of opts[2]) {
      const cards = [a, b, c].filter(Boolean); if (!cards.length) continue;
      out.push(evaluate(cards, PRESETS[preset], p, nPref));
    }
    out.sort((x, y) => x.mismatch - y.mismatch || y.exp - x.exp || x.pf - y.pf);
    const r = out.slice(0, top);
    if (preset === "상향 허용") r.forEach(c => c.warns.push("실패해 재도전하면 2028학년도부터 수능·내신 체제와 N수생 수시 지원 조건이 달라집니다"));
    return r;
  }

  // ---------------- 수시 납치 (engine/kidnap.py)
  const ga = w => { const ch = w.charCodeAt(w.length - 1); return w + (ch >= 0xAC00 && ch <= 0xD7A3 && (ch - 0xAC00) % 28 ? "이" : "가"); };
  function kidnap(univ, minStatus, prefs, pos) {
    if (minStatus === "미충족") return ["최저 미충족", "가채점 기준 최저를 못 맞춰 합격 가능성이 낮습니다(실채점으로 확정)."];
    const rank = {}; prefs.forEach((u, i) => rank[u] = i);
    const own = pos[univ] || "모름";
    const better = prefs.filter(u => univ in rank && rank[u] < rank[univ] && ["안정", "적정"].includes(pos[u]));
    if (better.length) return ["재고 필요", `정시로 더 선호하는 ${better.join(", ")}에 ${better.map(u => pos[u]).join(", ")} 가능성이 있습니다. 수시에 합격하면 등록하지 않아도 정시에 지원할 수 없습니다.`];
    if (own === "소신" || own === "위험") return ["수시 응시 강력 권장", `정시로는 ${ga(univ)} ${own} 수준입니다. 수시로 갈 수 있는 기회를 놓치지 않는 쪽이 유리합니다.`];
    if (own === "안정" || own === "적정") return ["응시 유지", `정시로도 ${univ} ${own} 수준이고 더 선호하는 대학의 정시 가능성은 확인되지 않았습니다.`];
    if (!(univ in rank)) return ["판단 재료 부족", "대학 선호 순위에 이 대학을 넣어 주세요."];
    return ["판단 재료 부족", "이 대학과 더 선호하는 대학들의 정시 예상 위치를 입력해 주세요."];
  }

  // ---------------- 수시 자격
  function eligibility(t, gradYear, ged) {
    if (t.grad_ok == null) return "확인 필요";
    if (ged && t.type === "교과") return "불가";
    if (t.grad_ok === false) return gradYear >= 2027 && !ged ? "가능" : "불가";
    if (t.grad_year_min && gradYear < t.grad_year_min) return "불가";
    return "가능";
  }

  root.IPSI = { checkRule, judge, compute, assess, gradeOf, FACTORS, THRESH, recommend, evaluate, P_DEFAULT, PRESETS, kidnap, eligibility };
})(typeof window !== "undefined" ? window : globalThis);
