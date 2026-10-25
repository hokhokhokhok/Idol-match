import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function NotFound() {
  return (
    <>
      <PageHeader title="극장" back="/theaters" />
      <main className="page-body"><EmptyState icon="🏛️" message="찾는 극장이 없어요" action={{ label: "극장 목록", href: "/theaters" }} /></main>
    </>
  );
}
