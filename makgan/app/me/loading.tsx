import PageHeader from "@/components/PageHeader";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="MY" />
      <main className="page-body"><Skeleton count={3} /></main>
    </>
  );
}
