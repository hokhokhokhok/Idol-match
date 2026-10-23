/** 과목. 감관법 = 감정평가관계법규 */
export type Subject = '민법' | '경제학원론' | '감관법';
/** 시험 순서: 1교시 민법·경제학원론, 2교시 감관법 */
export const SUBJECTS: readonly Subject[] = ['민법', '경제학원론', '감관법'];
export const SUBJECT_LABEL: Record<Subject, string> = { 민법: '민법', 경제학원론: '경제학원론', 감관법: '감정평가관계법규' };

/** 민법 단원 */
export type Unit = '총칙' | '물권' | '계약' | '채권총론' | '기타';

/** 감관법 출제 법률(앱 표기 약칭) */
export type Law =
  | '국토계획법'
  | '부동산공시법'
  | '감정평가법'
  | '국유재산법'
  | '건축법'
  | '공간정보법'
  | '등기법'
  | '도시정비법'
  | '동산채권담보법';

/** 경제학원론 단원 */
export type EconUnit =
  | '수요공급·탄력성·조세'
  | '소비자이론'
  | '생산자·비용'
  | '시장이론'
  | '요소시장·분배'
  | '일반균형·후생·시장실패'
  | '국민소득·승수·IS-LM·AD-AS'
  | '화폐·금융'
  | '물가·실업·소비투자'
  | '성장·경기변동'
  | '국제경제';
export type EconField = '미시' | '거시';

/** 통계·오답노트의 분류 단위: 민법·경제학원론은 단원, 감관법은 법률 */
export type Category = Unit | Law | EconUnit;

export type CivilType = 'single' | 'count' | 'combo' | 'case' | 'precedent';
export type LawType = 'single' | 'count' | 'combo' | 'case' | 'numeric';
export type EconType = 'calc' | 'concept' | 'combo' | 'graph' | 'table';
export type QuestionType = CivilType | LawType | EconType;
export type ChoiceNo = 1 | 2 | 3 | 4 | 5;

/** 감관법 문항 유형 필터(기획안 5절) */
export type Pattern = '정의' | '숫자·기간' | '절차·순서' | '예외·단서' | '사례';

export type CaseRef = { gist: string; citation?: string; verified: boolean };

export type Instrument = '법' | '시행령' | '시행규칙' | '고시';
export type LegalBasis = { instrument: Instrument; cite: string };

type QuestionBase = {
  id: string;
  setId: string;
  number: number;
  topic: string;
  /** 발문/사실관계. 인라인 마크업 **굵게**, <u>밑줄</u> 지원. 감관법은 <table> 지문도 허용 */
  stem: string;
  box?: { title?: string; items: { label: string; text: string }[] };
  /** 길이 5, 번호 기호(①~⑤)는 렌더러가 붙인다 */
  choices: string[];
  answer: ChoiceNo;
  difficulty: 1 | 2 | 3;
  source: 'original';
  reviewed: boolean;
};

export type CivilQuestion = QuestionBase & {
  subject: '민법';
  unit: Unit;
  type: CivilType;
  explanation: {
    summary: string;
    perChoice: string[];
    statutes: string[];
    cases?: CaseRef[];
  };
};

export type LawQuestion = QuestionBase & {
  subject: '감관법';
  law: Law;
  type: LawType;
  /** 문항 유형 필터. 없으면 type·topic에서 추정 */
  pattern?: Pattern;
  explanation: {
    summary: string;
    perChoice: string[];
    legalBasis: LegalBasis[];
  };
  /** 이 날짜에 시행 중인 법령 기준 (YYYY-MM-DD) */
  lawAsOf: string;
  /** 수치·기간·비율 등 개정되기 쉬운 내용 포함 */
  volatile: boolean;
};

/** 경제학 그래프(SVG로 그린다). 좌표는 (x, y), 원점 (0, 0) */
export type Figure = {
  kind: 'line-plot';
  xLabel: string;
  yLabel: string;
  xMax?: number;
  yMax?: number;
  series: { name: string; points: [number, number][]; dashed?: boolean }[];
  marks?: { label: string; at: [number, number] }[];
  shades?: { label?: string; polygon: [number, number][] }[];
};

/** 계산형 문항의 보기 주장: 보기 i가 "풀이값 key가 value와 같다/크다/작다"고 말한다 */
export type CalcClaim = { key: string; op?: '=' | '>' | '<'; value: number };

export type EconQuestion = QuestionBase & {
  subject: '경제학원론';
  field: EconField;
  unit: EconUnit;
  type: EconType;
  figure?: Figure;
  /**
   * 계산형 검증(npm run validate). solverId 풀이 함수를 params로 실행해 expected와 비교한다.
   * claims가 없으면 보기를 값(예: "60, 800")으로 읽어 정답 보기만 풀이 결과와 같은지,
   * claims가 있으면 보기별 주장(길이 5, 판단 대상이 아닌 보기는 null)의 참·거짓으로 정답이 하나뿐인지 검사한다.
   */
  calc?: { solverId: string; params: Record<string, number>; expected: number | string; claims?: (CalcClaim | null)[] };
  explanation: {
    summary: string;
    /** 계산 풀이 단계 */
    steps?: string[];
    perChoice: string[];
  };
};

export type Question = CivilQuestion | LawQuestion | EconQuestion;

export type QuestionSet = { id: string; title: string; subject: Subject; questions: Question[] };

/** 보기 옆 표시(애플펜슬 대용 탭 토글): 없음 → 밑줄(맞다고 본 보기) → X(지운 보기) */
export type ChoiceMark = 'none' | 'underline' | 'cross';

/** 문항의 분류(민법 단원 / 감관법 법률) */
export const categoryOf = (q: Question): Category => (q.subject === '감관법' ? q.law : q.unit);
/** 계산형 문항(정답을 풀이 코드로 검증하는 문항) */
export const isCalc = (q: Question) => q.subject === '경제학원론' && (q.type === 'calc' || !!q.calc);
