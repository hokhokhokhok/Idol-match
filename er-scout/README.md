# ER Scout

에스트로겐 수용체 알파(ERα) 결합 가능성을 1차 선별하는 단일 HTML 도구.
AR Scout와 같은 구조로, 수용체만 안드로겐에서 에스트로겐으로 바뀌었습니다.

`python3 build.py` → `index.html` (약 4 MB, 외부 요청 없음)

## 무엇이 실측이고 무엇이 예측인가

실측 자료는 셋입니다.

| 자료 | 출처 | 쓰이는 곳 |
|---|---|---|
| ERα 활성값 | ChEMBL `CHEMBL206`, 관계 `=` 이고 pChEMBL 값이 있는 기록만 | 레퍼런스 라이브러리의 pKi |
| Tox21 리포터 어세이 4종 | PubChem AID 743077 · 743079(작용제), 743078 · 743091(길항제) | 조회 물질의 실측 판정, read-across 풀 보강 |
| ERα LBD 결정구조 10종 | PDB 1GWR · 1X7R · 1L2I · 2P15 · 2B1V · 3OS8 · 1XP1 · 1SJ0 · 3ERT · 1ERR | 포켓 좌표, 리간드 포즈, helix-12 변위 |

그 밖의 값(pKi 추정, 작용/길항 판정, 접촉 예상)은 모두 계산된 예측입니다.
**도킹은 하지 않습니다** — 포즈는 전부 결정 좌표를 1GWR 기준계에 중첩한 것입니다.

## 판정 로직

1. **read-across** — Morgan 지문(r=2, 2048 bit) Tanimoto 상위 5종의 pKi를 sim³로 가중평균.
2. **ER 파마코포어 규칙** — 페놀 + 9~13결합 거리의 극성 말단(두 앵커 Glu353/Arg394와 His524에
   동시에 닿는 조건), 레조르시놀, 방향족 A-ring 스테로이드, 알킬페놀, 크기·부피·logP 항.
3. 둘을 최근접 유사도로 가중 결합(0.55↑ → read-across 78%, 0.35↑ → 50%, 그 미만 20%).
4. **작용제/길항제** — 결정구조 > Tox21 실측 > 곁사슬 규칙 > read-across 순서.
   곁사슬 규칙은 "아릴에터에 달린 염기성 아민" 또는 "스테로이드에 달린 8탄소 이상 사슬"이며,
   라벨 21종에서 길항제 7종 전부에 있고 작용제·부분작용제 14종에는 하나도 없습니다.

## 성능 (`node local/validate.js`)

- pKi leave-one-out: n=26, MAE 0.93 log, RMSE 1.37 log. 오차가 큰 쪽은 전부 과대평가.
- 기능 판정 leave-one-out: 20/21 (95%). 유일한 실패는 레스베라트롤(부분작용제).
  **이 수치는 적합도입니다** — 곁사슬 규칙과 문턱값을 같은 21종으로 정했습니다.
- 독립 검증: Tox21로만 라벨된 14종을 자기 어세이 결과를 가리고 맞히면 13/14.

## 구조

```
build.py                 단일 HTML 번들 생성
web/
  molmodel.js            SMILES 파서, 디스크립터, Morgan 지문, 구조 해시 (수용체 무관)
  ermotifs.js            ER 파마코포어 특징 — 페놀, 앵커 간격, SERM 꼬리, 플라보노이드…
  layout.js layout3d.js  2D·3D 좌표 (그리기용, 거리 측정용이 아님)
  predict.js             read-across + 규칙 + 접촉 매핑 + 이름 조회  ← 데이터 블록은 생성됨
  app.js styles.css body.html
  assets/                er_reference.json, er_names.json, pocket_scene.json, tox21_er.json, 글꼴
local/
  fetch_chembl.py        ChEMBL ERα 활성값 수집 → assets/chembl_er.json
  fetch_names.py         ChEMBL 화합물명 보강
  curated.json           큐레이션 목록 (이름·한글명·작용/길항 라벨)  ← 손으로 관리하는 유일한 데이터
  build_reference.py     curated.json을 ChEMBL로 해석 → er_reference.json, er_names.json
  build_pocket.py        PDB 복합체 → pocket_scene.json (포켓·포즈·helix-12 변위)
  pocket_volume.py       공동 부피 측정 (격자 + 둘러싸임 판정)
  build_tox21.py         PubChem 어세이 → tox21_er.json
  inject_data.py         predict.js의 생성 블록 채우기 + 포즈에 구조 해시 부여
  hash_smiles.js         구조 해시 (브라우저와 같은 엔진)
  validate.js            leave-one-out + Tox21 홀드아웃
  test_motifs.js         큐레이션 집합의 특징 검출 점검
```

데이터 재생성 순서:

```bash
python3 local/fetch_chembl.py
python3 local/fetch_names.py
python3 local/build_reference.py
python3 local/build_pocket.py <pdb_dir>     # 1GWR 등 PDB 파일을 미리 받아둘 것
python3 local/build_tox21.py <csv_dir>      # PubChem concise CSV
python3 local/inject_data.py
python3 build.py && node local/validate.js
```

## 한계

입체화학을 구분하지 못합니다(17α/17β-에스트라디올이 같게 보임). ERβ는 다루지 않습니다.
대사를 고려하지 않아 전구체(메톡시클로르, 타목시펜)는 과소평가됩니다.
혼합물·염·고분자를 받지 않습니다. 농도와 노출을 모르므로 결합 가능성은 위험성이 아닙니다.

세포실험 전 우선순위 선별용입니다. 규제 제출이나 안전성 판정의 근거로 쓸 수 없습니다.
