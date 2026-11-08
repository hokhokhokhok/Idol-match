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


def generate(inp: PostInput, data: dict, previous: list[dict] | None = None, today: date | None = None) -> Post:
    if inp.post_type != "jeongsi_overview":
        raise NotImplementedError(f"{TEMPLATES[inp.post_type].name}: {TEMPLATES[inp.post_type].phase}에 구현 예정")
    report = Report()
    check_sources(data, report)
    check_memo(inp.author_memo, report)

    u, j, p = data["univ"]["name"], data["jeongsi"], data["program"]
    dept = _v(p["name"])
    tone = TONES[inp.tone]
    is_sample = any(sv.status == "더미" for _, sv in iter_values(data))
    snap = data["data_snapshot_date"]
    sy, sm, sd = snap.split("-")

    q27, q26 = _v(j["quota_2027"]), _v(j["quota_2026"])
    diff = q27 - q26
    diff_txt = f"{abs(diff)}명 {'늘었' if diff > 0 else '줄었'}습니다" if diff else "작년과 같습니다"
    ratio = _v(j["ratio"])
    top_subj, top_val = max(ratio.items(), key=lambda kv: kv[1])
    total = _v(j["total_points"])
    past = [{k: (_v(v) if k != "year" else v) for k, v in row.items()} for row in data["past"]]
    last = past[-1]
    eng = _v(j["eng_table"])

    footnote = f"출처: {'샘플 더미 데이터' if is_sample else '대학 모집요강·입결'} · {sy}.{sm}.{sd} 기준"
    img_ratio = charts.ratio_chart(u, dept, ratio, footnote)
    img_cut = charts.cut_chart(u, dept, past, total, footnote)
    img_comp = charts.competition_chart(u, dept, past, footnote)
    thumb = charts.thumbnail(u, dept, f"{_v(j['group'])} {q27}명",
                             f"전년 대비 {diff:+d}명 · {top_subj} {top_val:g}%", "샘플" if is_sample else None)

    B: list[Block] = []
    if is_sample:
        B.append(Block("banner", "⚠️ 샘플 미리보기 — 더미 데이터로 만든 글입니다. 실제 수치가 아니므로 발행하지 마세요."))
    B.append(Block("lead", section="summary3", items=[
        f"2027 {u} {dept} 정시는 {_v(j['group'])} {q27}명 — 작년보다 {diff_txt}.",
        f"수능 반영비율은 {top_subj}이 {top_val:g}%로 가장 높습니다. ("
        + " · ".join(f"{k} {v:g}%" for k, v in ratio.items()) + ")",
        f"{last['year']}학년도 70% 컷은 {last['cut70']:.1f}점({total}점 환산, 참고치). 올해는 N수생 증가 변수도 함께 봐야 합니다.",
    ]))
    B.append(Block("p", tone["lead"]))

    B.append(Block("h", f"{u} {dept} 2027 정시, 몇 명 뽑나", section="quota"))
    B.append(Block("table", section="quota", header=["항목", "2026학년도", "2027학년도"], rows=[
        ["모집군", _v(j["group"]), _v(j["group"])],
        ["모집인원", f"{q26}명", f"{q27}명 ({diff:+d})"],
    ], meta={"caption": "모집군·모집인원 (수시 이월 전 기준)"}))
    B.append(Block("p", f"수시에서 뽑지 못한 인원은 12월 말 정시로 이월됩니다. 최종 모집인원은 이월 발표 후 다시 확인해야 합니다."))

    B.append(Block("h", "수능 반영비율 — 어떤 과목이 무거울까", section="ratio"))
    B.append(Block("img", image=img_ratio, section="ratio"))
    B.append(Block("p", f"{top_subj} 비중이 {top_val:g}%로 가장 큽니다. 활용 지표는 {_v(j['score_index'])}이고, "
                        f"탐구는 {_v(j['inquiry_count'])}과목을 반영합니다. {_v(j['elective_rule'])}."))

    B.append(Block("h", "영어·한국사는 이렇게 환산된다", section="eng_hist"))
    B.append(Block("table", section="eng_hist", header=["영어 등급"] + [f"{g}" for g in list(eng)[:5]],
                   rows=[["환산점수"] + [_num(eng[g]) for g in list(eng)[:5]]],
                   meta={"caption": f"영어 등급별 환산점수 (1~5등급, 1등급 대비 2등급 {_num(eng[2] - eng[1])}점)"}))
    hist = _v(j["hist_table"])
    B.append(Block("p", "한국사는 " + ", ".join(f"{k} {_num(v)}점" for k, v in hist.items()) + " 처리합니다. "
                        "4등급 이내면 감점이 없습니다."))

    B.append(Block("h", "학생부도 보나? 졸업생·검정고시는?", section="record"))
    B.append(Block("table", section="record", header=["항목", "내용"], rows=[
        ["학생부 반영", _v(j["record_reflect"])],
        ["졸업생 처리", _v(j["grad_record_policy"])],
        ["검정고시", _v(j["ged_policy"])],
        ["동점자 기준", _v(j["tie_break"])],
    ]))

    B.append(Block("h", "최근 3년 입결 (참고치)", section="past"))
    B.append(Block("table", section="past", header=["학년도", "50% 컷", "70% 컷", "경쟁률", "충원율"],
                   rows=[[str(r["year"]), f"{r['cut50']:.1f}", f"{r['cut70']:.1f}", f"{_num(r['competition'])}:1",
                          f"{_num(r['fill_rate'])}%"] for r in past],
                   meta={"caption": f"{total}점 만점 환산 기준 · 전년도 입결은 참고치"}))
    B.append(Block("img", image=img_cut, section="past"))
    B.append(Block("img", image=img_comp, section="past"))
    B.append(Block("p", "전년도 입결은 그해 지원자 구성과 모집인원에서 나온 결과입니다. "
                        "올해 모집인원·반영 방식·지원자 구성이 달라지면 그대로 옮겨 쓸 수 없습니다."))

    if data.get("insights"):
        B.append(Block("h", "2027에 달라지는 변수", section="factors"))
        B.append(Block("p", "아래는 입시기관의 공개 전망입니다. 공식 데이터가 아닌 참고 의견으로 봐주세요."))
        for ins in data["insights"]:
            B.append(Block("insight", ins.value, section="factors",
                           meta={"org": ins.source.doc.split()[0], "status": ins.status}))

    rec = _v(j["record_reflect"])
    B.append(Block("box", "📌 지원 전 체크 3가지", section="checkbox", items=[
        f"모집인원 {q27}명(전년 {q26}명) — 12월 말 수시 이월 발표 후 최종 인원 다시 확인",
        f"{top_subj} {top_val:g}%로 최고 비중 — 내 {top_subj} 성적이 다른 영역보다 강한지 환산해보기",
        f"학생부 {rec.split(' ')[0]} — " + ("졸업생도 교과평가 대상인지 확인" if "반영" in rec else "학생부 영향 없음 확인"),
    ]))

    B.append(Block("h", "✍️ 필자의 한마디", section="author"))
    B.append(Block("memo", inp.author_memo.strip(), section="author"))
    B.append(Block("p", tone["end"]))

    B.append(Block("question", f"여러분은 {top_subj}과 국어 중 어느 쪽이 더 자신 있나요? 댓글로 남겨주시면 다음 글에서 "
                               f"영역별 유불리를 비교해볼게요.", section="question"))
    sources = _collect_sources(data)
    B.append(Block("sources", section="sources", items=[f"{s.label()} — {s.url}" for s in sources]))
    notice = (f"2027학년도 대입 · {sy}년 {int(sm)}월 {int(sd)}일 기준 정리입니다. 최종 지원 전 반드시 {u} 입학처 모집요강 원문을 확인하세요. "
              "전년도 입결은 참고치이며 합격을 보장하지 않습니다.")
    B.append(Block("notice", notice, section="disclaimer"))
    if inp.ad_links:
        B.append(Block("notice", AD_NOTICE, section="disclaimer"))

    titles = [
        ("홈피드형", f"{u} {dept} 정시, 올해 {abs(diff)}명 {'늘었다' if diff > 0 else '줄었다'}… 2027 꼭 볼 숫자 3개"),
        ("홈피드형", f"{top_subj} {top_val:g}%가 가르는 {u} {dept}, 2027 정시 한 장 정리"),
        ("홈피드형", f"작년 70%컷 {last['cut70']:.1f}점, 올해도 비슷할까? {u} {dept} 정시 체크포인트"),
        ("검색형", f"2027 {u} {dept} 정시 모집인원·반영비율·입결 총정리"),
        ("검색형", f"{u} {dept} 정시 입결 {past[0]['year']}~{last['year']} (2027학년도 대비)"),
    ]
    uu, dd = u.replace(" ", ""), dept.replace(" ", "")
    tags = [f"{uu}{dd}", f"{uu}정시", "2027정시", "2027입시", f"{dd}정시", f"{uu}입결", "정시입결", "수능반영비율",
            f"{_v(j['group'])}", "정시파이터"]

    body_text = "\n".join([b.text for b in B] + [i for b in B for i in b.items])
    for t in [t for _, t in titles] + [body_text]:
        check_banned(t, report)
    if previous:
        check_duplicates(body_text, (tuple(inp.univ_ids), inp.dept, inp.post_type), previous, report)

    return Post(inp, titles, B, [thumb, img_ratio, img_cut, img_comp], tags, sources, report, snap, is_sample)


def body_text(post: Post) -> str:
    return "\n".join([b.text for b in post.blocks] + [i for b in post.blocks for i in b.items])
