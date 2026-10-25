import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function NotFound() {
  return (
    <>
      <PageHeader title="배우" back="/actors" />
      <main className="page-body"><EmptyState icon="🌟" message="찾는 배우가 없어요" action={{ label: "배우 둘러보기", href: "/actors" }} /></main>
    </>
  );
}
