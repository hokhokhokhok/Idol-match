import PageHeader from "@/components/PageHeader";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="막간" />
      <main className="page-body"><Skeleton count={4} /></main>
    </>
  );
}
