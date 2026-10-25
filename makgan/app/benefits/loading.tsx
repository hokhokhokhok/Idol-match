import PageHeader from "@/components/PageHeader";
import Skeleton from "@/components/Skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="혜택" />
      <main className="page-body"><Skeleton /></main>
    </>
  );
}
