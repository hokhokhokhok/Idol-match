import { Suspense } from "react";
import HomeView from "@/components/HomeView";
import { getRepository } from "@/lib/repository";

export default async function Home() {
  const academies = await getRepository().listAcademies();
  return (
    <Suspense fallback={<p className="p-4 text-sub">불러오는 중…</p>}>
      <HomeView academies={academies} />
    </Suspense>
  );
}
