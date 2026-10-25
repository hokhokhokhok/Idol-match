// 화면은 이 인터페이스만 쓴다. 지금은 CSV 구현, 이후 Supabase 구현으로 바꿔 끼운다.

import path from "node:path";
import { loadDatasetFromDir, type LoadResult } from "./dataset.ts";
import type { Academy, AcademyDetail, Dataset } from "./types.ts";

export interface AcademyRepository {
  listAcademies(): Promise<Academy[]>;
  getAcademy(id: string): Promise<AcademyDetail | null>;
}

export function createCsvRepository(dataset: Dataset): AcademyRepository {
  return {
    async listAcademies() {
      return dataset.academies;
    },
    async getAcademy(id) {
      const academy = dataset.academies.find((a) => a.id === id);
      if (!academy) return null;
      const people = dataset.people
        .filter((p) => p.academy_id === id)
        // 원장 먼저, 그다음 CSV 순서
        .sort((a, b) => (a.role === b.role ? 0 : a.role === "원장" ? -1 : 1))
        .map((p) => ({
          ...p,
          careers: dataset.careerItems
            .filter((c) => c.person_id === p.id)
            .sort((x, y) => (y.year_from ?? 0) - (x.year_from ?? 0)),
        }));
      return { ...academy, people };
    },
  };
}

let cached: LoadResult | null = null;

/** 빌드·서버 렌더 시 data/*.csv를 한 번 읽는다. 오류 행은 제외되고 issues에 남는다. */
export function loadData(): LoadResult {
  cached ??= loadDatasetFromDir(path.join(process.cwd(), "data"));
  return cached;
}

export function getRepository(): AcademyRepository {
  return createCsvRepository(loadData().dataset);
}
