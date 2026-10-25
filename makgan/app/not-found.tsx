import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function NotFound() {
  return (
    <>
      <PageHeader title="막간" back="/" />
      <main className="page-body"><EmptyState icon="🧭" message="찾는 페이지가 없어요" action={{ label: "홈으로", href: "/" }} /></main>
    </>
  );
}
