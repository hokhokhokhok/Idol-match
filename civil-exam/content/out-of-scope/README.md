# 출제범위 밖 문항 보관

출제범위를 **총칙·물권**으로 좁히면서 각 세트에서 뺀 계약 단원 문항(2026-001~003의 29~40번, seed-001의 5번, 총 37문항)을 원래 id 그대로 보관한다.

- 이 폴더는 앱 빌드에 포함되지 않는다(`src/data/sets/`만 번들됨). 앱 화면·맞춤 모의고사·통계에 나오지 않는다.
- 다시 범위에 넣으려면 해당 문항을 원래 세트 파일로 옮기고 `src/types.ts`·`src/lib/validate.ts`·`src/lib/stats.ts`의 단원 목록과 `config/blueprint.json`을 되돌린 뒤 `npm run validate`를 실행한다.
