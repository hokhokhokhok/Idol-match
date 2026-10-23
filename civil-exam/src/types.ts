/** 과목. 감관법 = 감정평가관계법규 */
export type Subject = '민법' | '감관법';
export const SUBJECTS: readonly Subject[] = ['민법', '감관법'];
export const SUBJECT_LABEL: Record<Subject, string> = { 민법: '민법', 감관법: '감정평가관계법규' };

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

/** 통계·오답노트의 분류 단위: 민법은 단원, 감관법은 법률 */
export type Category = Unit | Law;

export type CivilType = 'single' | 'count' | 'combo' | 'case' | 'precedent';
export type LawType = 'single' | 'count' | 'combo' | 'case' | 'numeric';
export type QuestionType = CivilType | LawType;
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

export type Question = CivilQuestion | LawQuestion;

export type QuestionSet = { id: string; title: string; subject: Subject; questions: Question[] };

/** 보기 옆 표시(애플펜슬 대용 탭 토글): 없음 → 밑줄(맞다고 본 보기) → X(지운 보기) */
export type ChoiceMark = 'none' | 'underline' | 'cross';

/** 문항의 분류(민법 단원 / 감관법 법률) */
export const categoryOf = (q: Question): Category => (q.subject === '감관법' ? q.law : q.unit);
