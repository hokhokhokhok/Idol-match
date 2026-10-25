import PageHeader from "@/components/PageHeader";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="용어 사전" />
      <main className="page-body"><Skeleton count={3} /></main>
    </>
  );
}
