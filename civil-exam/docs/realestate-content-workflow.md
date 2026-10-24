# 부동산학원론 문항 제작·검수 흐름

부동산학원론은 **화폐의 시간가치·투자분석·금융·감정평가 계산 문제**와 이론 개념 문제가 섞여 있다.
경제학원론과 같은 장치(풀이 함수로 계산 검증, 사람은 개념형을 교재와 대조)를 그대로 쓴다.

```
① 단원별 생성 (Claude 세션) → ② npm run validate -- --strict (계산 검증 포함) → ③ 검수 시트로 사람 검수 → ④ npm run mark → ⑤ 빌드·배포
```

## 이번 추가의 가정 (확인 필요)

별도 기획안 없이 경제학원론 1~8단계를 그대로 따랐다. 아래는 **추정값**이므로 보유 기출·Q-Net 공고로 보정한다.

| 항목 | 가정 | 파일 |
|---|---|---|
| 시험 포맷 | 1교시(민법·경제학원론·부동산학원론 120분) → 과목당 40분, 40문항·2.5점, 과락 40점 | `config/realestate/exam.json` (`scopeVerified: false`) |
| 계산기 | 허용 여부 미확인 — 앱은 설정에서 켜는 계산기를 제공 | `calculator.allowed: null` |
| 단원 배분 | 총론 3·경제론 5·시장·입지론 5·정책론 5·투자론 6·금융론 5·개발·관리·마케팅 4·감정평가론 7 (±1) | `config/realestate/blueprint.json` |
| 영역 | 총론·경제·시장 / 정책 / 투자·금융 / 개발·관리 / 감정평가 (통계 화면 '영역별') | 같은 파일의 `field` |
| 분량 | 유형별 글자 수 목표 | `config/realestate/length.json` (`RE_LENGTH_RULES`와 같아야 함, 테스트로 확인) |

## 문항 데이터 요점

- `subject: "부동산학원론"`, `field`(단원과 맞아야 함), `unit`(blueprint의 8개 단원), `type: calc | concept | combo | graph | table`.
- 수식·그래프·표·`steps`·`perChoice` 규칙은 [경제학원론 흐름](econ-content-workflow.md)과 같다. 금액은 보통 **만원 단위**로 적고 발문 단서에 밝힌다.
- 천 단위 쉼표: 일반 텍스트는 `24,000만원`, 수식 안은 `24{,}000`.

## 계산 검증 (`calc`)

`npm run validate`가 풀이 함수를 실행해 정답 일치·오답 보기 중복·보기 값 중복(값 보기)과 `calc.claims`(문장 보기)를 **오류로** 검사한다.

부동산학원론 풀이 함수(`src/solvers/realestate.ts`, `index.ts`에 등록):

| solverId | 내용 | 주요 값 |
|---|---|---|
| `time-value` | 6계수(일시불 내가·현가, 연금 내가·현가, 감채기금, 저당상수) | futureValue, presentValue, annuityFuture, annuityPresent, sinkingPayment, mortgagePayment |
| `npv-irr` | 순현가·수익성지수·내부수익률 | npv, pvInflow, pi, irr(%), accept |
| `expected-return` | 상황별 기대수익률·분산·표준편차·변이계수, 투자 여부 | expected, variance, sd, cv, invest |
| `portfolio-two` | 두 자산 포트폴리오 | expected, sd, weightedSd, diversification |
| `operating-cash-flow` | 영업수지(PGI→EGI→NOI→BTCF), 비율분석, 직접환원 | noi, btcf, dscr, equityDividendRate, overallCapRate, ltv, value |
| `loan-limit` | LTV·DTI 대출 한도(작은 값) | min |
| `amortization` | 원금균등·원리금균등 k기 상환액·이자·원금·잔금 | epPayment, epInterest, cpmPayment, cpmInterest … |
| `cost-approach` | 원가법(정액법) 적산가액 | value |
| `sales-comparison` | 거래사례비교법 비준가액 | value |
| `direct-capitalization` | 수익가액 = NOI ÷ 환원율 | value |
| `band-of-investment` | 물리적·금융적 투자결합법 환원율 | capRate |
| `huff-model` | 허프 확률모형 | prob_i, customers_i, sales_i |
| `retail-gravity` | 레일리 소매중력법칙·컨버스 분기점 | ratioAtoB, shareA, breakPointFromA |
| `cobweb` | 거미집 모형 수렴·발산·순환 | converge, diverge, price, quantity |
| `elasticity-mix` | 가격·소득·교차탄력성 합성 수요량 변화율 | dq |
| `location-quotient` | 입지계수(2지역 × 2산업) | lqXA, lqXB, lqYA, lqYB, basicXA |
| `information-value` | 개발정보의 현재가치 | certainPV, uncertainPV, informationValue |
| `leverage-return` | 레버리지와 자기자본수익률 | equityReturn, positive, negative |
| `percentage-lease` | 비율임대차 임대료 | extraRent, totalRent |

경제학원론 함수(`price-ceiling-linear`, `per-unit-tax-linear` 등)도 그대로 쓸 수 있다.

## ① 생성 — 단원별로

> civil-exam/docs/realestate-content-workflow.md 를 지켜 부동산투자론 6문항 JSON을 만들어줘. 계산형은 기존 풀이 함수를 쓰거나 새로 추가하고,
> 오답 보기는 흔한 실수 값(할인 누락, 연금·일시불 계수 혼동, 공실 미차감)으로 설계해줘. setId는 `re-2027-001`, 끝나면 `npm run validate -- --strict`.

작성 규칙: 창작 문항만(`source: "original"`), 정답 번호 ①~⑤ 각 8개 안팎, 보기별 해설 끝맺음(정답 "… 정답.", 옳지 않은 것 문항의 나머지 "… 옳다."), 감정평가 방식·용어는 「감정평가에 관한 규칙」 현행 표현과 대조.

## ③ 검수 · ④ 표시

```bash
npm run review-sheet -- re-2026-001     # docs/review/re-2026-001.md
npm run mark -- re-2026-001-q01          # 검수 완료 (계산 검증 실패 시 거부)
```

## 쟁점 사용 현황

| 세트 | 문항 |
|---|---|
| `re-seed-001` (7) | 일시불 내가계수, NPV(표), 원가법, 영업수지, 허프 모형, 거미집(그래프), 부동산의 특성 |
| `re-2026-001` (40, 계산 검증 17) | 부동산의 개념, 토지 용어, 특성과 파생현상 / 탄력성 합성, 거미집, 수요 변화 요인, 가격탄력성, 경기변동 / 허프, 레일리, 지대이론, 도시공간구조, 효율적 시장 / 시장실패, 임대료 상한(그래프), 주택정책, 거래세 귀착, 부동산 조세 / 연금 현가, NPV·PI·IRR, 기대수익률(표), 투자위험, 포트폴리오, DCF / LTV·DTI, 원금균등·원리금균등, 상환방식 비교, 리츠·증권화, 비율분석(표) / 개발 타당성, 민간투자 방식, 관리 방식, 마케팅 전략 / 원가법, 거래사례비교법(표), 직접환원법, 물리적 투자결합법, 감정평가 방법, 가격원칙, 지역·개별분석 |
| `re-2026-002` (40, 계산 검증 15) | 정착물, 주택·준주택, 부동산학의 성격 / 균형과 잉여, 임대료탄력성, 공급 변화 요인, 공급탄력성, 시장의 특성 / 입지계수(표), 공업입지론, 중심지이론, 여과과정, 개발정보 가치 / 토지정책 수단, TDR·개발이익, 공공임대주택, 분양가상한제, 보유세 귀착·자본화 / 감채기금, NPV·PI, 기대수익률(표), 레버리지, 위험분석, 투자분석 기법 / 원금균등 2년 차, 기존 부채와 DTI, 고정·변동금리, 주택연금, PF / 개발 방식, 환지·수용, 건물 생애주기, 비율임대차 / 원가법(잔가), 거래사례(사정보정), 직접환원, 금융적 투자결합법, 시산가액 조정, 감정평가 기준, 용어(조합) |
| `re-2026-003` (40, 계산 검증 15) | 인문적 특성, 경제적 개념, 토지 용어Ⅱ / 거미집(발산), 탄력성 합성, 저량·유량, 경기변동 유형, 시장 기능(조합) / 컨버스 분기점, 허프(표), 넬슨 소매입지, 스프롤, 상권분석 모형 / 토지이용규제, 거래신고·토지거래허가, 임대주택 과세 귀착, 임대차 규제, 주거 지원(조합) / 일시불 현가, IRR, 상관계수 −1 포트폴리오, 효율적 프런티어, 어림셈법(표), 투자 특징 / 원리금균등 1년 차, LTV 제약, 금융 원천, DTI·DSR, MBS 종류 / 개발 단계, AM·PM·FM, 임대차 유형, 정비사업 유형 / 원가법(잔가 0), 거래사례(시점·개별), 수익가액, 물리적 투자결합법, 감가수정, 가치 발생요인, 공시지가와 감정평가 |
