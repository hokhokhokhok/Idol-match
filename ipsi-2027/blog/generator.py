"""포스트 생성기. 현재 구현: ① 학과 정시 총정리(jeongsi_overview).

흐름: DB 데이터(SV) → 블록 리스트(중간 표현) → 렌더러(미리보기 HTML / 스마트에디터 HTML / 텍스트)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from . import charts
from .guardrails import (AD_NOTICE, Report, check_banned, check_duplicates, check_memo, check_sources,
                         iter_values)
from .models import PostInput, Source
from .templates import TEMPLATES

TONES = {
    "정보형": {"lead": "핵심만 숫자로 정리했습니다.", "end": "숫자는 바뀔 수 있으니 발표 때마다 업데이트하겠습니다."},
    "선배 조언형": {"lead": "입시를 먼저 겪어본 입장에서 꼭 봐야 할 숫자만 골랐어요.", "end": "숫자에 너무 흔들리지 말고, 내 점수 구조부터 보세요."},
    "학부모 눈높이": {"lead": "자녀와 함께 보시기 좋게 용어를 풀어서 정리했습니다.", "end": "용어가 어렵다면 '반영비율'과 '모집인원' 두 가지만 먼저 보셔도 충분합니다."},
}
AUDIENCES = ["수험생", "학부모", "수시파이터", "정시파이터", "병행형", "현역", "재수", "삼수", "N수", "반수", "검정고시"]


@dataclass
class Block:
    kind: str            # h | p | lead | table | img | box | insight | memo | question | sources | notice | banner
    text: str = ""
    rows: list[list[str]] = field(default_factory=list)
    header: list[str] = field(default_factory=list)
    items: list[str] = field(default_factory=list)
    image: charts.Image | None = None
    section: str = ""
    meta: dict = field(default_factory=dict)


@dataclass
class Post:
    input: PostInput
    titles: list[tuple[str, str]]       # (홈피드형|검색형, 제목)
    blocks: list[Block]
    images: list[charts.Image]
    tags: list[str]
    sources: list[Source]
    report: Report
    data_snapshot_date: str
    is_sample: bool


def _v(sv):
    return sv.value


def _num(x) -> str:
    return f"{x:g}" if isinstance(x, (int, float)) else str(x)


def _collect_sources(data: dict) -> list[Source]:
    seen, out = set(), []
    for _, sv in iter_values(data):
        if sv.source and sv.source not in seen:
            seen.add(sv.source)
            out.append(sv.source)
    return out


def josa(word: str, pair: str = "이/가") -> str:
    """받침 유무로 조사 선택 (이/가, 은/는, 을/를, 과/와)."""
    a, b = pair.split("/")
    ch = word[-1]
    has = "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 != 0
    return word + (a if has else b)


def _common_start(inp: PostInput, data: dict, report: Report):
    check_sources(data, report)
    check_memo(inp.author_memo, report)
    is_sample = any(sv.status == "더미" for _, sv in iter_values(data))
    snap = data["data_snapshot_date"]
    return is_sample, snap, snap.split("-")


def _tail(B: list[Block], inp: PostInput, data: dict, univ_label: str, sm: str, sd: str, question: str, tone_end: str):
    B.append(Block("h", "✍️ 필자의 한마디", section="author"))
    B.append(Block("memo", inp.author_memo.strip(), section="author"))
    B.append(Block("p", tone_end))
    B.append(Block("question", question, section="question"))
    sources = _collect_sources(data)
    B.append(Block("sources", section="sources", items=[f"{s.label()} — {s.url}" for s in sources]))
    B.append(Block("notice", f"2027학년도 대입 · {data['data_snapshot_date'][:4]}년 {int(sm)}월 {int(sd)}일 기준 정리입니다. "
                             f"최종 지원 전 반드시 {univ_label} 입학처 모집요강 원문을 확인하세요. "
                             "전년도 입결은 참고치이며 합격을 보장하지 않습니다.", section="disclaimer"))
    if inp.ad_links:
        B.append(Block("notice", AD_NOTICE, section="disclaimer"))
    return sources


def _finish(inp, B, titles, tags, images, sources, report, snap, is_sample, previous):
    text = "\n".join([b.text for b in B] + [i for b in B for i in b.items])
    for t in [t for _, t in titles] + [text]:
        check_banned(t, report)
    if previous:
        check_duplicates(text, (tuple(inp.univ_ids), inp.dept, inp.post_type), previous, report)
    return Post(inp, titles, B, images, tags, sources, report, snap, is_sample)


def generate(inp: PostInput, data, previous: list[dict] | None = None, today: date | None = None) -> Post:
    if inp.post_type == "rival_compare":
        return generate_rival(inp, data, previous)
    if inp.post_type in MORE:
        return MORE[inp.post_type](inp, data, previous)
    if inp.post_type != "jeongsi_overview":
        raise NotImplementedError(f"{TEMPLATES[inp.post_type].name}: {TEMPLATES[inp.post_type].phase}에 구현 예정")
    report = Report()
    is_sample, snap, (sy, sm, sd) = _common_start(inp, data, report)
    u, j, p = data["univ"]["name"], data["jeongsi"], data["program"]
    dept = _v(p["name"])
    tone = TONES[inp.tone]

    q27, q26 = _v(j["quota_2027"]), _v(j["quota_2026"])
    diff = q27 - q26
    diff_txt = f"{abs(diff)}명 {'늘었' if diff > 0 else '줄었'}습니다" if diff else "작년과 같습니다"
    ratio = _v(j["ratio"])
    top_subj, top_val = max(ratio.items(), key=lambda kv: kv[1])
    past = [{k: (_v(v) if k != "year" else v) for k, v in row.items()} for row in data.get("past", [])]
    last = past[-1] if past else None
    total = _v(j["total_points"]) if "total_points" in j else None

    footnote = f"출처: {'샘플 더미 데이터' if is_sample else f'{u} 2027 정시 모집요강'} · {sy}.{sm}.{sd} 기준"
    images = []
    thumb = charts.thumbnail(u, dept, f"{_v(j['group'])} {q27}명",
                             f"전년 대비 {diff:+d}명 · {top_subj} {top_val:g}%", "샘플" if is_sample else None,
                             "모집인원 · 반영비율 · 입결 총정리" if past else "모집인원 · 반영비율 총정리")
    img_ratio = charts.ratio_chart(u, dept, ratio, footnote)
    images += [thumb, img_ratio]

    B: list[Block] = []
    if is_sample:
        B.append(Block("banner", "⚠️ 샘플 미리보기 — 더미 데이터로 만든 글입니다. 실제 수치가 아니므로 발행하지 마세요."))
    line3 = (f"{last['year']}학년도 70% 컷은 {last['cut70']:.1f}점({total}점 환산, 참고치). 올해는 N수생 증가 변수도 함께 봐야 합니다."
             if last else "올해는 N수생이 크게 늘어난 해라, 전년 합격선을 그대로 믿기보다 모집인원·반영 구조 변화를 먼저 보세요.")
    B.append(Block("lead", section="summary3", items=[
        f"2027 {u} {dept} 정시는 {_v(j['group'])} {q27}명 — 작년보다 {diff_txt}.",
        f"수능 반영 비중은 {josa(top_subj)} {top_val:g}%로 가장 큽니다. (" + " · ".join(f"{k} {v:g}%" for k, v in ratio.items()) + ")",
        line3,
    ]))
    B.append(Block("p", tone["lead"]))

    B.append(Block("h", f"{u} {dept} 2027 정시, 몇 명 뽑나", section="quota"))
    B.append(Block("table", section="quota", header=["항목", "2026학년도", "2027학년도"], rows=[
        ["모집군", _v(j["group"]), _v(j["group"])],
        ["모집인원", f"{q26}명", f"{q27}명 ({diff:+d})"],
    ], meta={"caption": "정시 일반전형 모집인원 (수시 이월 전 기준)"}))
    B.append(Block("p", "수시에서 뽑지 못한 인원은 12월 말 정시로 이월됩니다. 최종 모집인원은 이월 발표 후 다시 확인해야 합니다."))

    B.append(Block("h", "수능 반영 구조 — 어떤 과목이 무거울까", section="ratio"))
    B.append(Block("img", image=img_ratio, section="ratio"))
    extra = []
    if "score_index" in j:
        extra.append(f"활용 지표는 {_v(j['score_index'])}입니다.")
    if "formula_text" in j:
        extra.append(f"요강의 산출 방식: {_v(j['formula_text'])}.")
    if "elective_rule" in j:
        extra.append(f"{_v(j['elective_rule'])}.")
    B.append(Block("p", f"{top_subj} 비중이 {top_val:g}%로 가장 큽니다. " + " ".join(extra)))

    if "eng_table" in j:
        eng = _v(j["eng_table"])
        mode = _v(j["eng_mode"]) if "eng_mode" in j else "환산점수"
        B.append(Block("h", "영어·한국사는 이렇게 반영된다", section="eng_hist"))
        B.append(Block("table", section="eng_hist", header=["영어 등급"] + [f"{g}" for g in list(eng)[:5]],
                       rows=[[mode] + [_num(eng[g]) for g in list(eng)[:5]]],
                       meta={"caption": f"영어 등급별 {mode} (1~5등급, 1→2등급 차이 {_num(abs(eng[2] - eng[1]))}점)"}))
        if "hist_table" in j:
            hist = _v(j["hist_table"])
            B.append(Block("p", "한국사는 " + ", ".join(f"{k} {_num(v)}점" for k, v in hist.items()) + "으로 반영합니다."))

    rec_rows = [[lab, _v(j[k])] for k, lab in (("record_reflect", "학생부 반영"), ("grad_record_policy", "졸업생 처리"),
                                              ("ged_policy", "검정고시"), ("tie_break", "동점자 기준")) if k in j]
    if rec_rows:
        B.append(Block("h", "학생부도 보나? 졸업생·검정고시는?", section="record"))
        B.append(Block("table", section="record", header=["항목", "내용"], rows=rec_rows))

    B.append(Block("h", "최근 입결 (참고치)", section="past"))
    if past:
        B.append(Block("table", section="past", header=["학년도", "50% 컷", "70% 컷", "경쟁률", "충원율"],
                       rows=[[str(r["year"]), f"{r['cut50']:.1f}", f"{r['cut70']:.1f}", f"{_num(r['competition'])}:1",
                              f"{_num(r['fill_rate'])}%"] for r in past],
                       meta={"caption": f"{total}점 만점 환산 기준 · 전년도 입결은 참고치"}))
        img_cut = charts.cut_chart(u, dept, past, total, footnote)
        img_comp = charts.competition_chart(u, dept, past, footnote)
        images += [img_cut, img_comp]
        B.append(Block("img", image=img_cut, section="past"))
        B.append(Block("img", image=img_comp, section="past"))
        B.append(Block("p", "전년도 입결은 그해 지원자 구성과 모집인원에서 나온 결과입니다. "
                            "올해 모집인원·반영 방식·지원자 구성이 달라지면 그대로 옮겨 쓸 수 없습니다."))
    else:
        report.warnings.append("전년도 입결 데이터 없음 — 입결 섹션은 안내 문구로 대체됨")
        B.append(Block("p", "이 글에는 전년도 입결 수치를 넣지 않았습니다. 앱에 출처가 확인된 입결 자료가 아직 없기 때문입니다. "
                            f"{u} 입학처의 입시결과 자료나 대입정보포털 어디가에서 직접 확인하세요."))

    _insight_blocks(B, data, "factors", heading="2027에 달라지는 변수")

    third = (f"학생부 {_v(j['record_reflect']).split(' ')[0]} — 졸업생도 학생부 반영 방식 확인"
             if "record_reflect" in j else "영어·한국사 반영 방식(가산/감점) 확인 — 등급 하나 차이가 몇 점인지 계산해보기")
    B.append(Block("box", "📌 지원 전 체크 3가지", section="checkbox", items=[
        f"모집인원 {q27}명(전년 {q26}명) — 12월 말 수시 이월 발표 후 최종 인원 다시 확인",
        f"{top_subj} {top_val:g}%로 최고 비중 — 내 {top_subj} 성적이 다른 영역보다 강한지 환산해보기",
        third,
    ]))
    sources = _tail(B, inp, data, u, sm, sd,
                    f"여러분은 {josa(top_subj, '과/와')} 다른 영역 중 어느 쪽이 더 자신 있나요? 댓글로 남겨주시면 다음 글에서 영역별 유불리를 비교해볼게요.",
                    tone["end"])
    titles = [
        ("홈피드형", f"{u} {dept} 정시, 올해 {abs(diff)}명 {'늘었다' if diff > 0 else '줄었다'}… 2027 꼭 볼 숫자 3개" if diff
         else f"{u} {dept} 정시 {q27}명 그대로… 2027 꼭 볼 숫자 3개"),
        ("홈피드형", f"{top_subj} {top_val:g}%가 가르는 {u} {dept}, 2027 정시 한 장 정리"),
        ("홈피드형", (f"작년 70%컷 {last['cut70']:.1f}점, 올해도 비슷할까? {u} {dept} 정시 체크포인트" if last
                    else f"N수생 역대급인 해, {u} {dept} 정시에서 먼저 볼 것")),
        ("검색형", f"2027 {u} {dept} 정시 모집인원·반영비율 총정리"),
        ("검색형", f"{u} {dept} 정시 2027 {_v(j['group'])} 수능 반영 방법"),
    ]
    uu, dd = u.replace(" ", ""), dept.replace(" ", "")
    tags = [f"{uu}{dd}", f"{uu}정시", "2027정시", "2027입시", f"{dd}정시", f"{uu}입결", "정시입결", "수능반영비율",
            f"{_v(j['group'])}", "정시파이터"]
    return _finish(inp, B, titles, tags, images, sources, report, snap, is_sample, previous)


def generate_rival(inp: PostInput, data: dict, previous=None) -> Post:
    """② 라이벌 학과 비교. data = {"dept", "schools": [{univ, name, group, q27, q26, weights, wtext, kind, ...}], ...}"""
    report = Report()
    is_sample, snap, (sy, sm, sd) = _common_start(inp, data, report)
    dept = data["dept"]
    S = data["schools"]
    names = [s["name"] for s in S]
    univs = "·".join(n.replace("대", "") for n in names)
    tone = TONES[inp.tone]
    footnote = f"출처: 각 대학 2027 정시 모집요강 · {sy}.{sm}.{sd} 기준"
    chart = charts.compare_chart(names, dept, [_v(s["weights"]) for s in S], footnote)
    thumb = charts.thumbnail("·".join(names), dept, f"{len(S)}개 대학 비교",
                             "모집군 · 인원 · 반영 구조", "샘플" if is_sample else None, "정시 라이벌 비교")
    groups = [_v(s["group"]) for s in S]
    same = len(set(groups)) == 1
    fixed = [s for s in S if not s.get("ranked")] or S
    math_top = max(fixed, key=lambda s: _v(s["weights"]).get("수", 0))
    kor_top = max(fixed, key=lambda s: _v(s["weights"]).get("국", 0))
    ranked = [s for s in S if s.get("ranked")]
    ranked_txt = (" " + ", ".join(s["name"] for s in ranked) + "는 국어·수학 중 잘한 영역에 더 큰 비중을 줍니다."
                  if ranked else "")

    B: list[Block] = []
    if is_sample:
        B.append(Block("banner", "⚠️ 샘플 미리보기 — 더미 데이터로 만든 글입니다."))
    B.append(Block("lead", section="summary3", items=[
        f"2027 {univs} {dept} 정시는 " + (f"모두 {groups[0]} — 정시에서는 이 중 한 곳만 지원할 수 있습니다."
                                         if same else "모집군이 갈려 " + ", ".join(f"{s['name']} {_v(s['group'])}" for s in S) + "입니다."),
        "모집인원은 " + ", ".join(f"{s['name']} {_v(s['q27'])}명("
                              + (f"{_v(s['q27']) - _v(s['q26']):+d}" if _v(s['q27']) != _v(s['q26']) else "전년과 동일") + ")"
                              for s in S) + ".",
        f"고정 비율 기준으로 수학 비중은 {josa(math_top['name'])}, 국어 비중은 {josa(kor_top['name'])} 가장 큽니다." + ranked_txt,
    ]))
    B.append(Block("p", tone["lead"]))
    B.append(Block("h", f"{univs} {dept} 한눈에 비교", section="table"))
    B.append(Block("table", section="table", header=["대학", "모집군", "2027 인원", "전년", "반영 비중"],
                   rows=[[s["name"], f"{_v(s['group'])}", f"{_v(s['q27'])}명", f"{_v(s['q26'])}명", s["wtext"]] for s in S],
                   meta={"caption": "정시 일반전형 · 수시 이월 전 인원 · 반영 비중은 만점 기여 비율(감점식 영어·한국사 제외)"}))
    B.append(Block("img", image=chart, section="table"))
    B.append(Block("h", "어떤 점수 구조에 유리할까", section="structure"))
    for s in S:
        B.append(Block("p", f"{s['name']}: {_v(s['formula_text'])}" + (f" ({s['kind']})" if s["kind"] != "요강식" else "")))
    B.append(Block("p", f"수학이 강하면 {math_top['name']}, 국어가 강하면 {kor_top['name']} 쪽 구조가 상대적으로 유리합니다.{ranked_txt} "
                        "다만 영어 반영 방식(가산·감점·환산표)이 대학마다 달라 등급 하나의 무게가 다릅니다."))
    B.append(Block("h", "전년 입결 나란히 보기 (참고치)", section="past"))
    report.warnings.append("비교 대상 대학의 전년도 입결 데이터 없음 — 안내 문구로 대체")
    B.append(Block("p", "이 글에는 입결 수치를 넣지 않았습니다. 대학마다 환산 만점이 달라 같은 표에 놓으려면 백분위 기준 자료가 필요한데, "
                        "앱에 출처가 확인된 자료가 아직 없습니다."))
    B.append(Block("h", "같은 군? 다른 군? 조합 포인트", section="combo"))
    B.append(Block("p", ("세 대학이 모두 같은 군이라 정시에서는 한 곳만 고를 수 있습니다. 나머지 두 군(가·다)에서 안정·적정 카드를 따로 준비해야 합니다."
                         if same and len(S) == 3 else
                         "같은 군끼리는 하나만 지원할 수 있습니다. 군이 다른 대학은 동시에 지원할 수 있으니 조합을 짜보세요.")))
    B.append(Block("box", "📌 지원 전 체크 3가지", section="checkbox", items=[
        "모집군이 겹치는지 — 같은 군이면 택1",
        "내 성적에서 국어·수학 중 강한 쪽 비중이 큰 대학인지",
        "12월 말 수시 이월 발표 후 대학별 최종 인원 변화",
    ]))
    data_for_src = data
    sources = _tail(B, inp, data_for_src, " · ".join(names), sm, sd,
                    f"여러분이라면 세 곳 중 어디에 정시 카드를 쓰시겠어요? 이유와 함께 댓글로 남겨주세요.", tone["end"])
    titles = [
        ("홈피드형", f"{univs} {dept}, 정시에선 " + ("셋 중 하나만 쓸 수 있다" if same else "어떻게 조합할까")),
        ("홈피드형", (f"수학 강하면 {math_top['name']}, 국어 강하면 {kor_top['name']}? {dept} 정시 비교"
                     if math_top is not kor_top else f"{univs} {dept}, 내 점수 구조엔 어디가 맞을까? 정시 비교")),
        ("홈피드형", f"{univs} {dept} 2027 정시 인원 변화 한 장 정리"),
        ("검색형", f"2027 {univs} {dept} 정시 비교 모집인원 반영비율"),
        ("검색형", f"{'·'.join(names)} {dept} 정시 반영 방법 비교 2027"),
    ]
    tags = [f"{n}{dept}" for n in names] + ["2027정시", f"{dept}정시", "정시비교", "수능반영비율", "정시파이터",
                                            "2027입시", f"{groups[0]}"]
    return _finish(inp, B, titles, tags[:11], [thumb, chart], sources, report, snap, is_sample, previous)


# ---------------------------------------------------------------- 유형 ③~⑥
def _insight_blocks(B, data, section, heading=None, intro=True):
    ins = data.get("insights") or []
    if not ins:
        return
    if heading:
        B.append(Block("h", heading, section=section))
    if intro:
        B.append(Block("p", "아래는 입시기관·언론의 공개 분석 요약입니다. 공식 데이터가 아닌 참고 의견으로 봐주세요.", section=section))
    for sv in ins:
        v = sv.value if isinstance(sv.value, dict) else {"org": sv.source.doc.split()[0], "summary": sv.value, "badge": "학원 관점"}
        if not isinstance(sv.value, dict):          # 더미 데이터 호환: 기존 배지 문구 유지
            B.append(Block("insight", v["summary"], section=section, meta={"org": v["org"], "status": sv.status}))
            continue
        B.append(Block("insight", v["summary"], section=section,
                       meta={"org": f"{v.get('badge', '학원 관점').replace(' 관점', '')} · {v['org']}", "status": sv.status}))


def _head(data, inp):
    report = Report()
    is_sample, snap, (sy, sm, sd) = _common_start(inp, data, report)
    u = data["univ"]["name"]
    dept = _v(data["program"]["name"])
    return report, is_sample, snap, sm, sd, u, dept, TONES[inp.tone]


def generate_susi_vs(inp, data, previous=None) -> Post:
    report, is_sample, snap, sm, sd, u, dept, tone = _head(data, inp)
    j = data["jeongsi"]
    susi = data["susi"]
    with_min = [r for r in susi if r["min"].value != "최저 없음"]
    after = [r for r in susi if r["exam"].value != "-" and any(m in r["exam"].value for m in ("11/2", "11/3", "12/"))]
    B = [Block("lead", section="summary3", items=[
        f"{u} {dept}, 2027 수시는 {len(susi)}개 일반 전형 중 {len(with_min)}개가 수능 최저를 봅니다.",
        f"수능 이후 고사가 남은 전형: " + (", ".join(_v(r['name']) for r in after) if after else "없음") + ".",
        f"정시는 {_v(j['group'])} {_v(j['quota_2027'])}명 — 수시에 합격하면 등록과 관계없이 정시 지원이 막힙니다.",
    ]), Block("p", tone["lead"])]
    B.append(Block("h", f"{u} {dept} 수시, 수능 이후 남은 전형", section="susi_list"))
    B.append(Block("table", section="susi_list", header=["전형", "수능 최저(정리)", "수능 후 고사", "발표"],
                   rows=[[_v(r["name"]), _v(r["min"]), _v(r["exam"]), _v(r["announce"])] for r in susi],
                   meta={"caption": f"모집단위 그룹: {susi[0]['units'] if susi else '-'} 기준 · 2027 수시모집요강"}))
    B.append(Block("h", "졸업생도 지원할 수 있나", section="eligibility"))
    B.append(Block("table", section="eligibility", header=["전형", "지원 자격"],
                   rows=[[_v(r["name"]), _v(r["grad"])] for r in susi]))
    B.append(Block("h", "정시로 가면", section="jeongsi"))
    ratio = _v(j["ratio"])
    B.append(Block("p", f"정시는 {_v(j['group'])} {_v(j['quota_2027'])}명(전년 {_v(j['quota_2026'])}명)이고, 수능 반영 비중은 "
                        + " · ".join(f"{k} {v:g}%" for k, v in ratio.items()) + f"입니다. {_v(j['formula_text'])}."))
    B.append(Block("h", "수시 납치 vs 수시 포기, 무엇을 볼까", section="kidnap"))
    B.append(Block("p", "수시 원서를 이미 냈다면 남은 선택은 수능 이후 고사에 응시할지입니다. 가채점으로 정시 예상 위치를 먼저 보고, "
                        f"정시로 {u}보다 더 원하는 대학이 안정권이면 응시를 다시 생각해볼 수 있습니다. 반대로 정시로는 {josa(u)} 어려운 점수라면 "
                        "수시 고사를 놓치지 않는 쪽이 유리합니다."))
    _insight_blocks(B, data, "kidnap", intro=False)
    B.append(Block("h", "꼭 알아둘 규칙", section="rule"))
    B.append(Block("p", _v(data["rule"]) + " (대교협 2027 대입전형 기본사항)."))
    B.append(Block("box", "📌 지원 전 체크 3가지", section="checkbox", items=[
        "가채점으로 수능 최저 충족·경계 여부부터 확인",
        "정시로 더 원하는 대학이 안정권인지 — 수시 합격 시 정시 지원 불가",
        "수능 후 고사 날짜가 다른 대학과 겹치는지",
    ]))
    sources = _tail(B, inp, data, u, sm, sd, f"{u} {dept}, 수시와 정시 중 어느 쪽에 더 무게를 두고 있나요? 댓글로 알려주세요.", tone["end"])
    thumb = charts.thumbnail(u, dept, "수시 vs 정시", "최저 · 고사 일정 · 정시 경로", "샘플" if is_sample else None, "수시·정시 경로 비교")
    titles = [("홈피드형", f"{u} {dept}, 수시로 갈까 정시로 갈까? 수능 끝나고 볼 것"),
              ("홈피드형", f"수능 최저 {len(with_min)}개 전형, {u} {dept} 수시 남은 일정 정리"),
              ("홈피드형", f"수시 붙으면 정시 못 쓴다 — {u} {dept} 수시 납치 점검"),
              ("검색형", f"2027 {u} {dept} 수시 최저 정시 비교"),
              ("검색형", f"{u} {dept} 수시 논술 면접 일정 2027")]
    tags = [f"{u}{dept}", f"{u}수시", f"{u}정시", "수시최저", "수시납치", "2027수시", "2027정시", "수능최저학력기준", "논술일정", "정시파이터"]
    return _finish(inp, B, titles, tags, [thumb], sources, report, snap, is_sample, previous)


TODO = {
    "수능 직후": ["가채점 후 수시 최저 충족·경계 판정", "수능 이후 논술·면접 응시 여부 결정(수시 납치 점검)", "기관별 예상 등급컷은 여러 곳을 비교"],
    "성적 발표": ["실채점 표준점수·백분위로 대학별 환산 다시 계산", "대학별 탐구 변환표준점수 공지 확인", "최고 표준점수 대비 방식 대학은 최고점 반영"],
    "수시 이월": ["대학별 최종 정시 모집인원 확인(이월 반영)", "인원이 늘어난 모집단위는 합격선 변화 가능성 점검", "가·나·다 조합 다시 보기"],
    "원서 경쟁률": ["마감 직전 경쟁률은 변동이 크니 최종 경쟁률로 판단", "전년 경쟁률·충원율과 함께 보기", "같은 군 대학 간 복수지원 금지 확인"],
    "충원 현황": ["충원 합격 통보 마감 시간 확인(홈페이지 14시, 개별 18시)", "등록 마감 시간 확인", "추가모집 일정 확인"],
}
EVENT_DATE = {"수능 직후": "2026-11-19", "성적 발표": "2026-12-11", "수시 이월": "2026-12-30", "원서 경쟁률": "2027-01-04",
              "충원 현황": "2027-02-13"}


def generate_timely(inp, data, previous=None) -> Post:
    report, is_sample, snap, sm, sd, u, dept, tone = _head(data, inp)
    ev = data["event"]
    j = data["jeongsi"]
    B = [Block("lead", section="summary3", items=[
        f"[{ev}] {u} {dept}에 지금 필요한 정보만 정리했습니다.",
        f"2027 정시 {_v(j['group'])} {_v(j['quota_2027'])}명(전년 {_v(j['quota_2026'])}명).",
        ("이번 발표 수치: " + f"{data.get('live_label', '')} {_v(data['live'])}" if data.get("live") else
         "아직 대학 발표 수치가 없어 일정과 체크리스트 위주로 정리했습니다."),
    ]), Block("p", tone["lead"])]
    B.append(Block("h", f"[{ev}] 지금 무슨 일이", section="what"))
    tl = data["timeline_raw"]
    ref = TL_date(EVENT_DATE.get(ev))
    upcoming = [e for e in tl if e.end >= ref][:4]
    B.append(Block("table", section="what", header=["날짜", "일정"],
                   rows=[[f"{e.start:%m/%d}" + (f"~{e.end:%m/%d}" if e.end != e.start else ""), e.title] for e in upcoming],
                   meta={"caption": "대교협 2027학년도 대학입학전형기본사항(2026.7.31 개정)"}))
    if data.get("live"):
        B.append(Block("h", f"{u} {dept} 숫자로 보기", section="numbers"))
        B.append(Block("p", f"{data.get('live_label', '')}: {_v(data['live'])} (출처: {data['live'].source.doc})"))
    if ev == "수능 직후" and data.get("susi_exams"):
        B.append(Block("h", f"{u} 수능 이후 수시 고사", section="numbers"))
        B.append(Block("table", section="numbers", header=["일정"], rows=[[_v(x)] for x in data["susi_exams"]]))
    B.append(Block("h", "이 숫자가 의미하는 것", section="impact"))
    B.append(Block("p", f"정시 모집인원은 수시 이월로 늘 수 있고, 올해는 N수생이 많아 전년 합격선을 그대로 쓰기 어렵습니다. "
                        f"{u} {dept}는 전년 대비 {_v(j['quota_2027']) - _v(j['quota_2026']):+d}명입니다."))
    _insight_blocks(B, data, "impact", intro=False)
    B.append(Block("h", "다음 할 일", section="todo"))
    B.append(Block("box", f"📌 [{ev}] 체크 3가지", section="checkbox", items=TODO.get(ev, TODO["수능 직후"])))
    sources = _tail(B, inp, data, u, sm, sd, "지금 가장 고민되는 건 무엇인가요? 댓글로 남겨주시면 다음 글에서 다룰게요.", tone["end"])
    thumb = charts.thumbnail(u, dept, ev, f"{_v(j['group'])} {_v(j['quota_2027'])}명", "샘플" if is_sample else None, "시점별 체크리스트")
    titles = [("홈피드형", f"[{ev}] {u} {dept} 지원자가 지금 할 일 3가지"),
              ("홈피드형", f"{ev}, {u} {dept} 정시 {_v(j['quota_2027'])}명 — 놓치면 안 되는 날짜"),
              ("홈피드형", f"{ev} 이후 {u} {dept}, 무엇이 달라지나"),
              ("검색형", f"2027 {u} {dept} {ev}"), ("검색형", f"{u} {dept} 정시 일정 2027 {ev}")]
    tags = [f"{u}{dept}", f"{u}정시", "2027정시", ev.replace(" ", ""), "정시일정", "2027입시", "수능", "정시파이터", "입시체크리스트"]
    return _finish(inp, B, titles, tags, [thumb], sources, report, snap, is_sample, previous)


def TL_date(s):
    from datetime import date as _d
    return _d.fromisoformat(s or "2026-11-19")


SEG_CHECK = {
    "N수생": ["수시 전형별 졸업생 지원 가능 여부·졸업연도 제한 확인", "정시 학생부 반영 대학이면 졸업생 학생부 처리 방식 확인",
             "2028 체제 변화(재학생 전용 수시 확대)를 판단 재료로 함께 보기 — 결과 수용도 정당한 선택"],
    "재수생": ["수시 '추천' 전형은 졸업 1~2년 이내만 되는 곳이 많음", "정시 학생부 반영 여부와 졸업생 처리 확인",
             "올해 결과와 재도전 조건을 차분히 비교(학교·전문 상담 권장)"],
    "반수생": ["현 소속 대학과 이중등록 금지 — 등록 마감 일정 확인", "휴학·자퇴 등 학적 처리 시점 확인", "현 소속 대학보다 확실히 나은 곳인지 비교"],
    "현역 정시파이터": ["N수생 유입이 큰 해 — 전년 합격선보다 보수적으로", "내 점수 구조(국·수 강약)와 반영 비중 맞추기", "가·나·다 중 안정 카드 1장은 확보"],
    "수시파이터": ["가채점 최저 판정 먼저", "정시로 더 높은 대학이 가능한지(수시 납치) 점검", "수능 후 고사 일정 겹침 확인"],
}


def generate_segment(inp, data, previous=None) -> Post:
    report, is_sample, snap, sm, sd, u, dept, tone = _head(data, inp)
    seg = data["segment"]
    j = data["jeongsi"]
    susi = data["susi"]
    grad_ok = [r for r in susi if r["grad_ok"]]
    B = [Block("lead", section="summary3", items=[
        f"{josa(seg)} {u} {josa(dept, '을/를')} 노린다면 먼저 지원 자격부터 확인하세요.",
        f"수시 일반 전형 {len(susi)}개 중 졸업생 지원 가능: {len(grad_ok)}개" + (
            " (일부는 졸업연도 제한)" if any(r["grad_year_min"] for r in grad_ok) else "") + ".",
        f"정시는 {_v(j['group'])} {_v(j['quota_2027'])}명 — " + (_v(j["record_reflect"]) if "record_reflect" in j else "수능 위주 선발") + ".",
    ]), Block("p", tone["lead"])]
    B.append(Block("h", f"{seg}에게 {u} {dept}가 갖는 의미", section="who"))
    B.append(Block("p", f"이 글은 {seg} 관점에서 {u} {dept}의 2027 전형 조건만 추렸습니다. 합격 가능성 판단은 개인 성적에 따라 달라집니다."))
    B.append(Block("h", f"{seg}에게 달라지는 전형 조건", section="rules"))
    B.append(Block("table", section="rules", header=["전형", "지원 자격"], rows=[[_v(r["name"]), _v(r["grad"])] for r in susi]))
    if "record_reflect" in j:
        B.append(Block("p", f"정시: {_v(j['record_reflect'])}."))
    _insight_blocks(B, data, "position", heading="경쟁 환경 — 올해는 누구와 겨루나")
    B.append(Block("h", f"{seg} 체크리스트", section="checklist"))
    B.append(Block("box", f"📌 {seg} 체크 3가지", section="checkbox", items=SEG_CHECK.get(seg, SEG_CHECK["N수생"])))
    if seg in ("N수생", "재수생", "반수생"):
        B.append(Block("p", "진로·심리 고민은 학교 상담실이나 전문 상담을 함께 활용하길 권합니다. 결과를 받아들이는 것과 다시 도전하는 것 모두 정당한 선택입니다."))
    sources = _tail(B, inp, data, u, sm, sd, f"{seg} 입장에서 가장 걱정되는 조건은 무엇인가요? 댓글로 나눠주세요.", tone["end"])
    thumb = charts.thumbnail(u, dept, seg, "지원 자격 · 정시 조건 · 체크리스트", "샘플" if is_sample else None, "세그먼트 가이드")
    titles = [("홈피드형", f"{josa(seg)} {u} {dept} 노릴 때 먼저 볼 것 3가지"),
              ("홈피드형", f"{u} {dept}, {seg}도 수시 쓸 수 있을까? 전형별 자격 정리"),
              ("홈피드형", f"{seg} 역대급인 해, {u} {dept} 정시 조건"),
              ("검색형", f"{seg} {u} {dept} 2027 지원자격"), ("검색형", f"2027 {u} {dept} {seg} 수시 정시")]
    tags = [f"{u}{dept}", seg.replace(" ", ""), f"{u}수시", f"{u}정시", "2027입시", "졸업생지원자격", "재수", "N수", "정시파이터"]
    return _finish(inp, B, titles, tags, [thumb], sources, report, snap, is_sample, previous)


def generate_change(inp, data, previous=None) -> Post:
    report, is_sample, snap, sm, sd, u, dept, tone = _head(data, inp)
    topic = data["topic"]
    j = data["jeongsi"]
    ins = data.get("insights") or []
    if not ins:
        report.errors.append(f"주제 '{topic}'에 등록된 인사이트가 없습니다 — 인사이트 탭에서 출처와 함께 추가하세요")
    diff = _v(j["quota_2027"]) - _v(j["quota_2026"])
    B = [Block("lead", section="summary3", items=[
        f"2027 입시의 큰 변수 '{topic}', {u} {dept}에는 어떤 의미일까요.",
        (ins[0].value["summary"].split(".")[0] + "." if ins else "관련 공개 분석을 정리했습니다."),
        f"{u} {dept} 정시는 {_v(j['group'])} {_v(j['quota_2027'])}명({diff:+d}명).",
    ]), Block("p", tone["lead"])]
    B.append(Block("h", f"2027 {topic}, 무엇이 바뀌었나", section="change"))
    facts = [sv for sv in ins if sv.value.get("kind") in ("공식", "언론")]
    B.append(Block("p", " ".join(sv.value["summary"] for sv in (facts or ins)[:2]) or "-"))
    B.append(Block("h", f"{u} {dept}에는 어떤 영향?", section="dept_link"))
    B.append(Block("p", f"{u} {dept} 정시 모집인원은 {_v(j['quota_2026'])}명 → {_v(j['quota_2027'])}명입니다. 반영 비중은 "
                        + " · ".join(f"{k} {v:g}%" for k, v in _v(j["ratio"]).items())
                        + ". 환경 변화가 이 학과 합격선에 얼마나 반영될지는 수시 이월과 실제 지원 경쟁률을 보고 판단해야 합니다."))
    _insight_blocks(B, data, "views", heading="기관별 전망 비교")
    B.append(Block("h", "그래서 수험생은 무엇을 확인할까", section="so_what"))
    B.append(Block("box", "📌 확인할 것 3가지", section="checkbox", items=[
        "전년 합격선을 그대로 쓰지 말고 올해 변수와 함께 보기",
        "12월 말 수시 이월 후 최종 모집인원 확인",
        "기관 전망은 참고 의견 — 서로 다른 전망을 나란히 비교",
    ]))
    sources = _tail(B, inp, data, u, sm, sd, f"'{topic}', 체감하고 계신가요? 댓글로 의견을 나눠주세요.", tone["end"])
    thumb = charts.thumbnail(u, dept, topic, "2027 변화 해설", "샘플" if is_sample else None, "2027 변화 해설")
    titles = [("홈피드형", f"2027 {topic}, {u} {dept} 지원자에게 무슨 의미일까"),
              ("홈피드형", f"{topic} — 기관마다 전망이 다르다, {u} {dept} 관점 정리"),
              ("홈피드형", f"올해 입시 판이 바뀐 이유: {topic}"),
              ("검색형", f"2027 입시 {topic} {u} {dept}"), ("검색형", f"{topic} 2027 정시 영향")]
    tags = [f"{u}{dept}", topic.replace(" ", ""), "2027입시", "2027정시", "입시변화", "N수생", "사탐런", "정시파이터"]
    return _finish(inp, B, titles, tags, [thumb], sources, report, snap, is_sample, previous)


MORE = {"susi_vs_jeongsi": generate_susi_vs, "timely_news": generate_timely, "segment_guide": generate_segment,
        "change_2027": generate_change}


def body_text(post: Post) -> str:
    return "\n".join([b.text for b in post.blocks] + [i for b in post.blocks for i in b.items])
