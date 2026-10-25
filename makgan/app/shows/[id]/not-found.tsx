import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function NotFound() {
  return (
    <>
      <PageHeader title="공연" back="/shows" />
      <main className="page-body"><EmptyState icon="🎭" message="찾는 공연이 없어요" action={{ label: "공연 둘러보기", href: "/shows" }} /></main>
    </>
  );
}
