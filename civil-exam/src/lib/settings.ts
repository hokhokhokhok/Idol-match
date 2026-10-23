import { examConfig } from './config';
import { db } from './db';
import { SUBJECTS, type Subject } from '../types';

export const FONT_SIZES = [15, 17, 19] as const;
export type FontSize = (typeof FONT_SIZES)[number];

export const TIME_MIN = 10;
export const TIME_MAX = 150;
export const TIME_STEP = 5;

export type Settings = {
  /** 시험지 본문 글자 크기(px) */
  fontSize: FontSize;
  /** 40문항 기준 시험시간(분). 문항 수가 다른 세트는 비례 */
  timeLimitMinutes: number;
  /** 해설 즉시 보기(연습 모드): 문항마다 고르는 즉시 채점·해설 */
  instantExplanation: boolean;
  /** 맞춤 모의고사에서 정답률이 가장 낮은 단원(감관법은 법률)에 문항 가중치(+2) */
  weakUnitBoost: boolean;
  /** 홈에서 마지막으로 고른 과목 탭 */
  subject: Subject;
  lastBackupAt?: number;
};

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 17,
  timeLimitMinutes: examConfig.defaultTimeLimitMinutes,
  instantExplanation: false,
  weakUnitBoost: true,
  subject: '민법',
};

export type SettingsRow = Settings & { id: 'app' };

/** 저장된 값을 허용 범위로 정리 (백업 복원·구버전 대비) */
export function normalizeSettings(s: Partial<Settings> | undefined): Settings {
  const fontSize = (FONT_SIZES as readonly number[]).includes(Number(s?.fontSize))
    ? (Number(s!.fontSize) as FontSize)
    : DEFAULT_SETTINGS.fontSize;
  const t = Math.round(Number(s?.timeLimitMinutes));
  const timeLimitMinutes = Number.isFinite(t) ? Math.min(TIME_MAX, Math.max(TIME_MIN, t)) : DEFAULT_SETTINGS.timeLimitMinutes;
  return {
    fontSize,
    timeLimitMinutes,
    instantExplanation: Boolean(s?.instantExplanation),
    weakUnitBoost: s?.weakUnitBoost === undefined ? DEFAULT_SETTINGS.weakUnitBoost : Boolean(s.weakUnitBoost),
    subject: SUBJECTS.includes(s?.subject as Subject) ? (s!.subject as Subject) : DEFAULT_SETTINGS.subject,
    ...(typeof s?.lastBackupAt === 'number' ? { lastBackupAt: s.lastBackupAt } : {}),
  };
}

const LEGACY_FONT_KEY = 'ce:fontSize';

export async function loadSettings(): Promise<Settings> {
  const row = await db.settings.get('app');
  if (row) return normalizeSettings(row);
  // 1~4단계에서 localStorage에 두던 글자 크기를 이어받는다
  let legacyFont: unknown;
  try {
    legacyFont = localStorage.getItem(LEGACY_FONT_KEY);
  } catch {
    /* 무시 */
  }
  return normalizeSettings({ fontSize: Number(legacyFont) as FontSize });
}

export const saveSettings = (s: Settings) => db.settings.put({ ...s, id: 'app' });
