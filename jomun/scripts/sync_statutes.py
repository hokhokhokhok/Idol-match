#!/usr/bin/env python3
"""기본 조문 팩(data/pack.js)의 조문 문구를 국가법령정보센터 원문으로 다시 맞춘다(법령 개정 후 실행).

원문 출처: legalize-kr 저장소(법제처 Open API로 받은 현행 법령을 Markdown으로 보관)
  git clone --depth 1 --filter=blob:none --sparse https://github.com/legalize-kr/legalize-kr
  cd legalize-kr && git sparse-checkout set --no-cone 'kr/공익사업을위한토지등의취득및보상에관한법률/*' \
    'kr/부동산가격공시에관한법률/*' 'kr/감정평가및감정평가사에관한법률/*' 'kr/행정기본법/*' 'kr/행정소송법/*' \
    'kr/행정절차법/*' 'kr/행정심판법/*' 'kr/대한민국헌법/*' 'kr/감정평가에관한규칙/*'
실행(저장소 루트에서): python3 jomun/scripts/sync_statutes.py <legalize-kr 경로> [--dry-run]

- 각 조문의 article("제70조 제4항", "제40조 제5항 제1호ㆍ제3호 본문" 등)대로 조ㆍ항ㆍ호를 골라 원문을 만든다.
- 지금 문구의 빈칸 {{ }} 어구를 원문에서 찾아 그대로 옮긴다. 못 옮긴 빈칸은 보고하니 손으로 다시 지정한다.
- 문구가 바뀐 조문은 replaces[id]에 예전 문구 해시를 남기고 version을 1 올린다 → 기기에서 사용자가 안 고친 조문만 새 문구로 바뀐다.
"""
import json, re, sys, os
CIRC="①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
TAG=re.compile(r"\s*<(?:개정|신설|전문개정|본조신설|제목개정|종전|삭제)[^>]*>")
BR=re.compile(r"\s*\[(?:전문개정|본조신설|제목개정|종전|시행일)[^\]]*\]")
def clean(t):
    t=t.replace("\\.",".").replace("\\-","-").replace("\\*","*")
    t=TAG.sub("",t); t=BR.sub("",t)
    return re.sub(r"\s+"," ",t).strip()
def parse(path):
    arts={}; meta={}
    lines=open(path,encoding="utf-8").read().split("\n")
    m=re.search(r"^시행일자:\s*(\S+)","\n".join(lines[:40]),re.M); meta["asOf"]=m.group(1) if m else ""
    m=re.search(r"^제목:\s*(.+)$","\n".join(lines[:40]),re.M); meta["name"]=m.group(1).strip() if m else ""
    cur=None
    for ln in lines:
        h=re.match(r"^#{5}\s*제(\d+)조(?:의(\d+))?\s*(?:\((.*?)\))?",ln)
        if h:
            key=h.group(1)+("-"+h.group(2) if h.group(2) else "")
            cur={"title":(h.group(3) or "").strip(),"paras":[]}
            arts[key]=cur; continue
        if ln.startswith("#"): cur=None if ln.startswith("##") and not ln.startswith("#####") else cur; 
        if cur is None or not ln.strip(): continue
        s=ln.rstrip()
        p=re.match(r"^\*\*([①-⑳])\*\*\s*(.*)$",s.strip())
        it=re.match(r"^\s{1,3}(\d+(?:의\d+)?)\\?\.\s*(.*)$",s)
        mk=re.match(r"^\s{4,}([가-하])\\?\.\s*(.*)$",s)
        if p: cur["paras"].append({"n":CIRC.index(p.group(1))+1,"text":clean(p.group(2)),"items":[]})
        elif it:
            if not cur["paras"]: cur["paras"].append({"n":0,"text":"","items":[]})
            cur["paras"][-1]["items"].append({"n":it.group(1),"text":clean(it.group(2)),"subs":[]})
        elif mk and cur["paras"] and cur["paras"][-1]["items"]:
            cur["paras"][-1]["items"][-1]["subs"].append({"n":mk.group(1),"text":clean(mk.group(2))})
        else:
            if not cur["paras"]: cur["paras"].append({"n":0,"text":clean(s),"items":[]})
            elif cur["paras"][-1]["items"]:
                last=cur["paras"][-1]["items"][-1]
                (last["subs"][-1] if last["subs"] else last)["text"]+=" "+clean(s)
            else: cur["paras"][-1]["text"]=(cur["paras"][-1]["text"]+" "+clean(s)).strip()
    return meta,arts

ROOT=sys.argv[1] if len(sys.argv)>1 else sys.exit(__doc__)
DRY="--dry-run" in sys.argv
K=os.path.join(ROOT,"kr")+"/"
HERE=os.path.dirname(os.path.abspath(__file__))
PACK=os.path.join(HERE,"..","data","pack.js")
src=open(PACK,encoding="utf-8").read()
head=src[:src.index("this, {")+6]
pack=json.loads(src[src.index("this, {")+6:src.rindex("}")+1])
B="공익사업을위한토지등의취득및보상에관한법률/"
FILES={"토지보상법":B+"법률.md","토지보상법 시행령":B+"시행령.md","토지보상법 시행규칙":B+"시행규칙.md",
"부동산공시법":"부동산가격공시에관한법률/법률.md","감정평가법":"감정평가및감정평가사에관한법률/법률.md",
"행정기본법":"행정기본법/법률.md","행정소송법":"행정소송법/법률.md","행정절차법":"행정절차법/법률.md",
"행정심판법":"행정심판법/법률.md","헌법":"대한민국헌법/헌법.md","감정평가에 관한 규칙":"감정평가에관한규칙/국토교통부령.md"}
P={k:parse(K+v) for k,v in FILES.items()}
def nums(rest,unit):
    out=[]
    for a,b in re.findall(r"제(\d+)"+unit+r"(?:~제(\d+)"+unit+")?",rest):
        out+= list(range(int(a),int(b)+1)) if b else [int(a)]
    return out
def cut(t): 
    i=t.find(" 다만,"); return t if i<0 else t[:i]
def item_text(it,body):
    t=cut(it["text"]) if body else it["text"]
    s=f'{it["n"]}. {t}'
    for sb in it["subs"]: s+=f' {sb["n"]}. {sb["text"]}'
    return s
def compose(law,article):
    m=re.match(r"^제(\d+)조(?:의(\d+))?(.*)$",article); key=m.group(1)+("-"+m.group(2) if m.group(2) else ""); rest=m.group(3)
    art=P[law][1].get(key)
    if not art: return None,None,"조문 없음 "+key
    paras=art["paras"]; hang=nums(rest,"항"); ho=nums(rest,"호")
    body="본문" in rest and "단서" not in rest; noitems="본문" in rest
    sel=[p for p in paras if not hang or p["n"] in hang]
    if hang and len(sel)!=len(hang): return None,art["title"],f"항 없음 {hang}"
    multi=len(sel)>1
    parts=[]
    for p in sel:
        lead=p["text"]
        if ho:
            its=[i for i in p["items"] if int(re.match(r"\d+",i["n"]).group())in ho and "의" not in i["n"]]
            if len(its)!=len(ho): return None,art["title"],f"호 없음 {ho}"
            seg=" ".join(item_text(i,body) for i in its)
            if lead and not re.search(r"(용어의 뜻은|정의는) 다음과 같다",lead): seg=lead+" "+seg
        else:
            seg=cut(lead) if body else lead
            if not noitems and p["items"]: seg+=" "+" ".join(item_text(i,False) for i in p["items"])
        parts.append((CIRC[p["n"]-1]+" " if multi and p["n"] else "")+seg.strip())
    return " ".join(parts).strip(),art["title"],None
def plain(t): return re.sub(r"\{\{|\}\}","",t)
def transfer(oldtext,new):
    blanks=re.findall(r"\{\{(.+?)\}\}",oldtext); spans=[]; miss=[]
    for b in blanks:
        start=0; placed=False
        while True:
            i=new.find(b,start)
            if i<0: break
            if all(i>=e or i+len(b)<=s for s,e in spans): spans.append((i,i+len(b))); placed=True; break
            start=i+1
        if not placed: miss.append(b)
    out=new
    for s,e in sorted(spans,reverse=True): out=out[:s]+"{{"+out[s:e]+"}}"+out[e:]
    return out,miss,len(spans)
def djb2(t):
    h=5381
    b=t.encode("utf-16-le")
    for i in range(0,len(b),2):
        h=((h<<5)+h+(b[i]|b[i+1]<<8))&0xFFFFFFFF
    return h

changed=0; problems=[]
for it in pack["items"]:
    text,title,err=compose(it["law"],it["article"])
    if err: problems.append(f'{it["id"]} {it["law"]} {it["article"]}: {err}'); continue
    t2,miss,n=transfer(it["text"],text)
    if miss: problems.append(f'{it["id"]}: 원문에서 못 찾은 빈칸 {miss}')
    if n==0: problems.append(f'{it["id"]}: 빈칸이 하나도 없음 — 직접 지정 필요'); continue
    asof=P[it["law"]][0]["asOf"]
    if t2!=it["text"]:
        pack.setdefault("replaces",{})[it["id"]]=djb2(it["text"]); it["text"]=t2; changed+=1
        print("바뀜:",it["id"],it["article"])
    it["verified"]=True
    it["source"]={"law":P[it["law"]][0]["name"],"asOf":asof,"note":"국가법령정보센터 원문(legalize-kr 저장소 경유) 그대로, 시행일 "+asof}
for p in problems: print("확인 필요:",p)
print(f"조문 {len(pack['items'])}개 중 문구 바뀜 {changed}개, 확인 필요 {len(problems)}개")
if changed and not DRY:
    pack["version"]+=1
    open(PACK,"w",encoding="utf-8").write(head+json.dumps(pack,ensure_ascii=False,indent=1)+");\n")
    print("data/pack.js 저장, version",pack["version"],"— sw.js의 VERSION도 올릴 것")
