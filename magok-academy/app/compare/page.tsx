import type { Metadata } from "next";
import CompareView from "@/components/CompareView";
import { getRepository } from "@/lib/repository";
import type { AcademyDetail } from "@/lib/types";

export const metadata: Metadata = { title: "학원 비교 · 서울 뮤지컬 학원 찾기" };

export default async function ComparePage() {
  const repo = getRepository();
  // 데이터가 작아 전체 상세를 넘기고, 담은 학원은 브라우저(localStorage)에서 고른다.
  const details = (await Promise.all((await repo.listAcademies()).map((a) => repo.getAcademy(a.id)))).filter(
    (d): d is AcademyDetail => d !== null,
  );
  return <CompareView details={details} />;
}
