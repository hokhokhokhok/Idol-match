# AR Scout — 안드로겐 수용체 결합 예측 도구

화장품·생활화학 원료가 안드로겐 수용체(AR)에 결합할 가능성을 단계적으로 좁혀가는
도구 모음입니다. **세포실험 대상의 우선순위를 정하는 데까지가 이 도구의 역할입니다.**

---

## 4단계 워크플로

| 단계 | 도구 | 입력 | 출력 | 걸리는 시간 | 무엇을 거르나 |
|---|---|---|---|---|---|
| 1. 1차 선별 | `ar-scout.html` | 물질명 또는 SMILES, 최대 400건 배치 | pKi ± 오차, 작용/길항 추정, 포켓 접촉도 | 즉시 | 명백한 비결합 물질. 수백 건을 수십 건으로 |
| 2. 모델 강화 | `local/train_qsar.py` | ChEMBL AR 데이터 | `ar_reference.json`, `ar_model.pkl` | 10–30분 | 레퍼런스 28종 → 수천 종. 적용영역 `out` 비율을 줄임 |
| 3. 3차 검증 | `local/ar_dock.py` | 1단계 배치 결과 CSV | `results.csv`, 포즈, 접촉 잔기 | 리간드당 1–3분 | 2D로는 구분 못 하는 입체 충돌·앵커 불일치 |
| 4. 세포실험 | — | 3단계 통과 물질 | 전사활성 측정 | — | 실제 판정은 여기서만 |

2단계는 선택입니다. 1단계 결과의 적용영역 태그가 대부분 `in`이면 건너뛰어도 됩니다.

---

## 설치

웹앱은 설치가 필요 없습니다. `ar-scout.html` 파일 하나를 브라우저로 열거나
사내에 링크로 공유하면 됩니다. 의존성 0, 외부 요청 0이므로 **입력한 원료 구조는
외부로 나가지 않습니다.**

```bash
# 웹앱 다시 빌드 (소스를 고쳤을 때만)
cd web && python3 build.py          # -> ../ar-scout.html

# 웹앱 테스트
cd web
node test/test_descriptors.js   # 분자식·MW·logP
node test/test_layout.js        # 2D 좌표 품질
node test/test_predict.js       # leave-one-out 성능
node test/test_aromaticity.js   # 표기 불변성 (케쿨레 = 소문자)
node test/smoke.js              # 번들 렌더링 (build.py 먼저 실행)
```

로컬 파이프라인:

```bash
cd local
pip install -r requirements.txt

# smina는 파이썬 패키지가 아니라 별도 실행파일입니다 (PyPI에 없음)
conda install -c conda-forge smina

# conda가 없는 환경이라면 micromamba를 conda 패키지로 직접 받아 부트스트랩:
#   curl -sSLO https://conda.anaconda.org/conda-forge/linux-64/micromamba-2.10.0-0.tar.bz2
#   tar -xjf micromamba-2.10.0-0.tar.bz2 bin/micromamba
#   MAMBA_ROOT_PREFIX=$PWD/mm ./bin/micromamba create -y -p ./env -c conda-forge smina
#   ./env/bin/smina --version
# ar_dock.py에 --smina ./env/bin/smina 로 경로를 넘기면 됩니다.

python3 test_ar_dock.py         # PDB 파싱·박스·접촉 분석 (네트워크/RDKit/smina 불필요)
python3 test_pipeline.py        # 정제 규칙·모델 학습 (네트워크 불필요, RDKit·sklearn 필요)
python3 test_crosscheck.py      # 웹 엔진 전체를 RDKit과 대조 (node + RDKit 필요)
python3 test_dock_integration.py --smina <경로>   # 재도킹 통합 테스트 (smina + ProDy 필요)
```

`test_dock_integration.py`는 ProDy에 동봉된 실제 결정 구조(1PWC, 페니실린 결합
효소)로 **재도킹(redocking)** 을 돌립니다. 결정 구조의 리간드를 꺼내 3D를 새로
만들고 자기 자리에 다시 도킹해, 원래 위치를 되찾는지 봅니다. 네트워크가 필요
없어 도킹 설정이 멀쩡한지 언제든 확인할 수 있습니다.

---

## 1단계 — 웹앱

**단건 조회**는 한글/영문 물질명 사전(97종)과 SMILES 직접 입력을 모두 받습니다.
출력은 pKi 추정값과 오차범위, Ki 환산값, 작용/길항 판정, 적용영역 태그,
포켓 접촉도, 2D 구조식, 기술자, 판정 근거, 최근접 레퍼런스 5종입니다.

**배치 스크리닝**은 `이름,SMILES` 한 줄씩 또는 CSV 업로드를 받아 pKi 순으로
정렬합니다. 결과는 TSV로 복사해 그대로 3단계 입력으로 쓸 수 있습니다.

**레퍼런스 라이브러리** 탭에서 2단계가 만든 `ar_reference.json`을 붙여넣거나
업로드하면 read-across 기준이 교체됩니다. 파싱에 실패한 항목은 건너뛰고
몇 건이 적용됐는지 알려줍니다.

### 결과 읽는 법

**적용영역 태그를 pKi보다 먼저 보세요.**

| 태그 | 최근접 유사도 | 오차범위 | 해석 |
|---|---|---|---|
| `적용영역 내` | ≥ 0.55 | ±0.7 | 유사 레퍼런스가 있음. 수치를 신뢰할 수 있는 구간 |
| `적용영역 경계` | ≥ 0.35 | ±1.1 | 참고용. 순위는 쓸 만하지만 절대값은 믿지 말 것 |
| `적용영역 밖` | < 0.35 | ±1.6 | **수치를 읽지 말고 태그만 보세요.** 규칙 점수에 의존한 외삽 |

| pKi 구간 | Ki | 통상 해석 |
|---|---|---|
| ≥ 8.0 | ≤ 10 nM | 강한 결합. 3단계 필수 |
| 6.5 – 8.0 | 10–300 nM | 유의한 결합. 3단계 권장 |
| 5.0 – 6.5 | 0.3–10 µM | 약한 상호작용. 노출량에 따라 판단 |
| < 5.0 | > 10 µM | 결합 근거 약함 |

---

## 2단계 — `train_qsar.py`

```bash
python3 train_qsar.py                  # 수집 + 정제 + 레퍼런스 + 모델
python3 train_qsar.py --cache          # 받아둔 원본 JSON 재사용
python3 train_qsar.py --skip-model     # 레퍼런스 JSON만
python3 train_qsar.py --max-ref 1000
python3 train_qsar.py --scaffold-split # 스캐폴드 분할로 재평가
```

정제 규칙이 결과를 좌우합니다:

- `standard_relation`이 `>`, `<` 같은 부등호인 **절단 측정값은 버립니다.** 참값이
  보고된 숫자 너머에 있으므로 정확한 값과 함께 평균 내면 전체가 편향됩니다.
- `data_validity_comment`가 달린 항목도 버립니다.
- pChEMBL이 없으면 nM 값에서 `9 − log10(nM)`로 직접 계산하고, 2.0–12.0 범위
  밖은 제외합니다.
- 같은 구조의 여러 측정값은 **중앙값**으로 통합하고 최대−최소 편차를 note에 남깁니다.
- 상한에 걸리면 **상위 N개를 자르지 않고 0.5 log 구간별로 고르게 샘플링합니다.**
  활성 물질만 남기면 "결합하지 않는다"는 판정 능력이 사라지는데, 이 도구가
  실제로 받는 질문은 대부분 그쪽입니다.

### 교차검증 MAE가 0.5 log 미만이면 경고가 뜹니다

실험 재현성 자체가 ±0.5 log 수준이므로, 무작위 분할에서 그보다 좋은 점수가
나오면 **좋은 모델이 아니라 데이터 누수 신호**입니다. 같은 시리즈 유사체가
train/test 양쪽에 나뉘어 들어가 모델이 친화도 예측이 아니라 시리즈 인식으로
점수를 받은 것입니다. `--scaffold-split`으로 Murcko 스캐폴드 기반 `GroupKFold`
재평가를 돌리면 처음 보는 골격에 대한 실제 성능이 나옵니다.

`test_pipeline.py`가 이 현상을 합성 데이터셋(108종, 6개 스캐폴드)으로 재현합니다:

| 분할 방식 | MAE | RMSE | R² |
|---|---|---|---|
| 무작위 5-fold | 0.224 | 0.273 | **0.637** |
| 스캐폴드 GroupKFold | 0.450 | 0.544 | **−0.442** |

같은 데이터, 같은 모델인데 R²가 0.64에서 음수로 떨어집니다. 무작위 분할의
0.637은 모델이 친화도를 예측해서 받은 점수가 아니라 **이미 본 적 있는 스캐폴드를
알아봐서 받은 점수**였다는 뜻입니다. 음수 R²는 "평균값으로 찍느니만 못하다"는
의미이고, 처음 보는 골격에 대해서는 그게 실제 성능입니다. **그쪽이 진짜 숫자입니다.**

---

## 3단계 — `ar_dock.py`

```bash
python3 ar_dock.py --prepare                      # 2AM9 내려받아 분리
python3 ar_dock.py --smiles "CC12CCC3..." --name DHT
python3 ar_dock.py --csv shortlist.csv            # name,smiles 열 인식
python3 ar_dock.py --prepare --pdb 2OZ7           # 길항 형태 수용체
```

**도킹 박스는 공결정 리간드 좌표에서 산출합니다.** 단백질만 보고 포켓 위치를
추측하는 것이 엉뚱한 공동에 도킹하는 가장 흔한 경로입니다. 결정 구조에 실제로
들어있는 리간드가 진짜 자리를 표시해 줍니다. 산출된 박스는 `box.json`에 남습니다.

웹앱과 **같은 잔기 체계**를 쓰므로 두 결과를 줄 단위로 대조할 수 있습니다.

### 앵커 조합별 의미

| A-ring (Gln711/Arg752) | D-ring (Asn705/Thr877) | 해석 |
|---|---|---|
| ✓ | ✓ | 전형적 AR 리간드 결합 양상 |
| ✓ | ✗ (또는 반대) | 한쪽 앵커만 충족 — 배향 불안정 가능 |
| ✗ | ✗ | 소수성 접촉만 — 특이적 결합 근거 약함 |

helix-12(Met895/Ile899/Leu880)에 접촉이 잡히면 AF-2 교란 가능, 즉 길항 성향을
시사합니다.

### affinity 구간별 해석

| affinity (kcal/mol) | 해석 |
|---|---|
| ≤ −10 | 강한 결합 포즈. 앵커 조합까지 맞으면 4단계로 |
| −10 ~ −8 | 유의한 포즈. 접촉 잔기를 직접 확인할 것 |
| −8 ~ −6 | 경계. 앵커가 없으면 비특이 결합일 가능성 |
| ≥ −6 | 약함, 위양성 의심 |

---

## 한계 — 솔직하게

**도킹 점수는 순위용이지 친화도 예측값이 아닙니다.** 실측 pKi와의 상관은
보통 r² 0.3–0.5입니다. 점수 차이 0.5 kcal/mol로 두 물질의 우열을 가르지 마세요.

- **2AM9는 작용제 결합 형태입니다.** 엔잘루타미드처럼 helix-12를 밀어내는
  길항제는 이 구조에 제대로 들어가지 않아 과소평가됩니다. `--pdb 2OZ7` 같은
  길항 형태에도 돌려 두 결과를 비교해야 합니다.
- **수용체를 rigid로 고정합니다.** 곁사슬이 움직여야 들어가는 리간드는
  과소평가됩니다. smina의 `--flexdist` / `--flexdist_ligand` 옵션으로 포켓 주변
  곁사슬을 유연하게 두고 재실행해 보세요.
- **구조수를 제거합니다.** Arg752 매개 수분자가 중요한 리간드는 영향을 받습니다.
- **대사 활성화를 모릅니다.** flutamide는 전구체이고 활성은 hydroxyflutamide에
  있는데 2D 구조가 거의 같아, 1단계에서 flutamide가 2 log 이상 과대평가됩니다.
- **4-aza 스테로이드를 오분류합니다.** finasteride는 5α-환원효소 억제제이지
  AR 리간드가 아니지만 2D 유사도로는 DHT와 구분되지 않습니다.
- **입체화학을 무시합니다.** 1단계 파서는 키랄리티·동위원소 표기를 읽기만 하고
  값은 쓰지 않으므로 거울상 이성질체가 같게 평가됩니다. 반면 방향족성은
  인식하므로 케쿨레 표기(PubChem의 Canonical SMILES 형식)와 소문자 표기는
  같은 결과를 냅니다.
- **금속 함유·고분자·혼합물은 범위 밖입니다.** 징크피리치온 같은 금속 배위
  화합물은 기술자 자체를 신뢰할 수 없습니다.

**모든 결과는 세포실험 전 우선순위 선별용입니다. 규제 제출이나 안전성 판정의
근거로는 사용할 수 없습니다.**

---

## 검증된 수치

웹앱 테스트를 실제로 돌려 나온 값입니다.

| 항목 | 값 |
|---|---|
| 분자식·MW 검증 | 18종 중 18종 통과 (허용오차 0.6) |
| clogP | DHT 3.84, 스테로이드류 3.6–5.1, flutamide류 1.1–1.8 |
| 2D 레이아웃 | 7종 전부 결합 교차 0개, 결합길이 표준편차 0.00–0.09 |
| leave-one-out MAE | 0.843 log |
| leave-one-out RMSE | 1.156 log |
| RDKit 대조 | 라이브러리 125종 전부 분자식·MW·중원자·고리수·방향족고리수 일치 |
| 표기 불변성 | RDKit 생성 케쿨레 변형 104종 + 수기 19쌍, 전부 동일 결과 |
| 재도킹 (1PWC) | RMSD 2.07 Å, 중심 변위 2.21 Å, 결정 접촉 잔기 69% 회수, 촉매 Ser62 수소결합 재현 |
| 번들 크기 | 112 KB (의존성 0) |
| `test_ar_dock.py` | 26종 통과 (PDB 파싱, 박스, 접촉/수소결합 컷오프, 해석 분기) |
| `test_pipeline.py` | 38종 통과 (정제 규칙, 중앙값 통합, 계층 샘플링, 모델 학습) |
| RDKit SDF 왕복 | DHT 51원자 → 중원자 21개(C19 O2) 정확히 파싱 |

레퍼런스 자체가 실험실 간 ±0.5–1 log의 분산을 가지므로 이보다 낮은 오차는
기대할 수 없습니다.

LOO에서 가장 크게 틀린 항목 — 모델의 구조적 한계이며 규칙을 덧붙여 억지로
맞추지 않고 실패 모드로 남겨둔 것들입니다:

| 물질 | 실측 | 예측 | 오차 | 원인 |
|---|---|---|---|---|
| Finasteride | 4.50 | 8.11 | +3.61 | 4-aza 스테로이드. 2D 유사도로는 DHT와 구분 안 됨 |
| Estradiol | 5.50 | 7.99 | +2.49 | 스테로이드 코어지만 A-ring이 방향족이라 AR에는 약함 |
| Flutamide | 5.20 | 7.36 | +2.16 | 전구체. 활성대사체와 구조가 거의 같음 |
| Hydroxyflutamide | 7.57 | 6.08 | −1.49 | 위와 같은 이유로 반대 방향 오차 |
| RU-59063 | 9.00 | 7.52 | −1.48 | 유사 레퍼런스 부족 |

이 항목들을 고치려면 2D 기술자만으로는 부족하고 3D 정렬이나 도킹이 필요합니다.
2·3단계가 있는 이유입니다.

---

## 파일 구성

```
ar-scout/
  ar-scout.html            빌드 결과물 — 이 파일 하나만 공유하면 됨
  web/
    armodel.js             SMILES 파서, 기술자, Morgan 지문, 구조 모티프
    layout.js              거리기하 완화 2D 좌표
    predict.js             read-across + 파마코포어 규칙 + 레퍼런스 28종
    app.js                 UI 렌더링
    shell.html             HTML/CSS 템플릿
    build.py               단일 HTML 번들러
    test/                  5종 테스트
  local/
    train_qsar.py          ChEMBL → 레퍼런스 JSON + RandomForest
    ar_dock.py             smina 도킹 + 접촉 잔기 분석
    test_ar_dock.py        PDB 파싱·박스·접촉 분석 점검
    test_pipeline.py       정제 규칙·모델 학습 점검
    test_crosscheck.py     웹 엔진 ↔ RDKit 교차검증
    test_dock_integration.py  재도킹 통합 테스트
    requirements.txt
```
