/** 출제범위: 민법 총칙·물권 ('기타'는 범위 안의 분류 보조용) */
export type Unit = '총칙' | '물권' | '기타';
export type QuestionType = 'single' | 'count' | 'combo' | 'case' | 'precedent';
export type ChoiceNo = 1 | 2 | 3 | 4 | 5;

export type CaseRef = { gist: string; citation?: string; verified: boolean };

export type Question = {
  id: string;
  setId: string;
  number: number;
  unit: Unit;
  topic: string;
  type: QuestionType;
  /** 발문/사실관계. 인라인 마크업 **굵게**, <u>밑줄</u> 지원 */
  stem: string;
  box?: { title?: string; items: { label: string; text: string }[] };
  /** 길이 5, 번호 기호(①~⑤)는 렌더러가 붙인다 */
  choices: string[];
  answer: ChoiceNo;
  explanation: {
    summary: string;
    perChoice: string[];
    statutes: string[];
    cases?: CaseRef[];
  };
  difficulty: 1 | 2 | 3;
  source: 'original';
  reviewed: boolean;
};

export type QuestionSet = { id: string; title: string; questions: Question[] };

/** 보기 옆 표시(애플펜슬 대용 탭 토글): 없음 → 밑줄(맞다고 본 보기) → X(지운 보기) */
export type ChoiceMark = 'none' | 'underline' | 'cross';
