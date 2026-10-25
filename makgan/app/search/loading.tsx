import PageHeader from "@/components/PageHeader";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="검색" />
      <main className="page-body"><Skeleton count={2} /></main>
    </>
  );
}
