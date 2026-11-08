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

    if data.get("insights"):
        B.append(Block("h", "2027에 달라지는 변수", section="factors"))
        B.append(Block("p", "아래는 입시기관의 공개 전망입니다. 공식 데이터가 아닌 참고 의견으로 봐주세요."))
        for ins in data["insights"]:
            B.append(Block("insight", ins.value, section="factors",
                           meta={"org": ins.source.doc.split()[0], "status": ins.status}))

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


def body_text(post: Post) -> str:
    return "\n".join([b.text for b in post.blocks] + [i for b in post.blocks for i in b.items])
