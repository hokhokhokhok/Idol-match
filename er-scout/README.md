# ER Scout

에스트로겐 수용체 알파(ERα) 결합 가능성을 1차 선별하는 단일 HTML 도구.
AR Scout와 같은 구조로, 수용체만 안드로겐에서 에스트로겐으로 바뀌었습니다.

`python3 build.py` → `index.html` (약 5 MB, 외부 요청 없음)
`python3 build.py out.html --no-font` → 글꼴 제외 2.3 MB (메일 첨부용)

## 무엇이 실측이고 무엇이 예측인가

실측 자료는 셋입니다.

| 자료 | 출처 | 쓰이는 곳 |
|---|---|---|
| ERα 활성값 | ChEMBL `CHEMBL206`, 관계 `=` 이고 pChEMBL 값이 있는 기록만 | 레퍼런스 라이브러리의 pKi |
| Tox21 리포터 어세이 4종 | PubChem AID 743077 · 743079(작용제), 743078 · 743091(길항제) | 조회 물질의 실측 판정, read-across 풀 보강 |
| ERα LBD 결정구조 10종 | PDB 1GWR · 1X7R · 1L2I · 2P15 · 2B1V · 3OS8 · 1XP1 · 1SJ0 · 3ERT · 1ERR | 포켓 좌표, 리간드 포즈, helix-12 변위 |

그 밖의 값(pKi 추정, 작용/길항 판정, 접촉 예상)은 모두 계산된 예측입니다.
**도킹은 하지 않습니다** — 포즈는 전부 결정 좌표를 1GWR 기준계에 중첩한 것입니다.

## 지방세포 신호 패널

ERα 하나로는 "지방이 늘어나는가"에 답할 수 없어서, 같은 read-across를 두 수용체에
더 돌리고 가장 직접적인 증거인 표현형 실측치를 옆에 놓습니다.

| 축 | 자료 | 규모 |
|---|---|---|
| PPARγ (분화 마스터 조절자) | ChEMBL CHEMBL235 + Tox21 743140·743199 + PDB 9종 | 4,231종 / 8,135종 |
| GR (분화 칵테일의 다른 축) | ChEMBL CHEMBL2034 + Tox21 720719·720725 | 3,039종 / 7,845종 |
| 지방세포 분화·지질축적 | ChEMBL 어세이(3T3-L1, ST-13 등) 703건 | 867종 (촉진 337 / 억제 501 / 양쪽 29) |

PPARγ 결정구조의 분류는 측정한 그대로입니다: 리간드가 helix-12의 Tyr473과
수소결합하는지. 로지글리타존·파글리타자르는 Ser289·His323·His449·Tyr473을 모두
잡고, 부분작용제 MRL-24는 Tyr473을 잡지 않습니다. 공유결합 길항제 GW9662도
Tyr473에 닿기 때문에 라벨을 "작용제"가 아니라 "AF-2 결합"이라고 씁니다.

**이 번들은 지방이 피하로 가는지 내장으로 가는지 측정하지 않습니다.** 수용체 활성과
배양세포 분화까지가 데이터이고, 부위 분포(에스트로겐은 피하 쪽, 글루코코르티코이드는
내장 쪽, TZD는 피하 쪽)는 문헌 배경지식으로 결과 화면에 따로 표시됩니다.

PPARγ·GR 어세이는 방향당 웰이 하나뿐이라 **농도(AC50)가 기록되지 않은 활성 신호는
판정에 쓰지 않습니다** — 에스트라디올과 비스페놀 A가 두 수용체의 길항제 웰에서
농도 없이 "활성"으로 나오는데, 이는 세포독성·간섭 물질의 전형적인 모습입니다.

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
- 독립 검증: Tox21로만 라벨된 30종을 자기 어세이 결과를 가리고 맞히면 27/30.
  (모델 카드는 이 숫자들을 적재된 라이브러리로 매번 다시 계산해 보여줍니다.)

## 구조

```
build.py                 단일 HTML 번들 생성
web/
  molmodel.js            SMILES 파서, 디스크립터, Morgan 지문, 구조 해시 (수용체 무관)
  ermotifs.js            ER 파마코포어 특징 — 페놀, 앵커 간격, SERM 꼬리, 플라보노이드…
  panel.js               지방세포 신호 패널 — PPARγ·GR read-across, 표현형 실측, 통합 해석
  layout.js layout3d.js  2D·3D 좌표 (그리기용, 거리 측정용이 아님)
  predict.js             read-across + 규칙 + 접촉 매핑 + 이름 조회  ← 데이터 블록은 생성됨
  app.js styles.css body.html
  assets/                er_reference.json, er_names.json, pocket_scene.json, tox21_er.json, 글꼴
local/
  fetch_chembl.py        ChEMBL ERα 활성값 수집 → assets/chembl_er.json
  fetch_names.py         ChEMBL 화합물명 보강
  curated.json           큐레이션 목록 (이름·한글명·작용/길항 라벨)  ← 손으로 관리하는 유일한 데이터
  build_reference.py     curated.json을 ChEMBL로 해석 → er_reference.json, er_names.json
  build_pocket.py        PDB 복합체 → 포켓 장면. 수용체별 설정 파일을 받습니다
  pocket_er.json         ERα 설정 (helix-12 변위로 작용/길항 분류)
  pocket_pparg.json      PPARγ 설정 (Tyr473 수소결합 여부로 분류)
  fetch_adipo.py         ChEMBL 지방세포 분화·지질축적 어세이 → adipo_pheno.json
  pack_panels.py         PPARγ·GR 라이브러리를 번들용으로 압축
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
python3 local/build_pocket.py <pdb_dir> local/pocket_er.json
python3 local/build_pocket.py <pdb_dir> local/pocket_pparg.json
python3 local/build_tox21.py <csv_dir> er      # PubChem concise CSV
python3 local/build_tox21.py <csv_dir> pparg
python3 local/build_tox21.py <csv_dir> gr
python3 local/fetch_chembl.py CHEMBL235 chembl_pparg.json
python3 local/fetch_chembl.py CHEMBL2034 chembl_gr.json
python3 local/fetch_adipo.py
python3 local/pack_panels.py
python3 local/inject_data.py
python3 build.py && node local/validate.js
```

## 한계

입체화학을 구분하지 못합니다(17α/17β-에스트라디올이 같게 보임). ERβ는 다루지 않습니다.
대사를 고려하지 않아 전구체(메톡시클로르, 타목시펜)는 과소평가됩니다.
혼합물·염·고분자를 받지 않습니다. 농도와 노출을 모르므로 결합 가능성은 위험성이 아닙니다.

세포실험 전 우선순위 선별용입니다. 규제 제출이나 안전성 판정의 근거로 쓸 수 없고,
체형을 바꿀 목적의 사용 근거는 더더욱 되지 못합니다. PPARγ를 켜는 물질 상당수는
내분비계 교란물질이거나 처방 관리 대상 의약품입니다.
