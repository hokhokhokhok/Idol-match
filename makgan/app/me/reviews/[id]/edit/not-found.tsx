import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export default function NotFound() {
  return (
    <>
      <PageHeader title="후기 수정" back="/me" />
      <main className="page-body"><EmptyState icon="📒" message="수정할 수 있는 후기가 아니에요" action={{ label: "내 기록으로", href: "/me" }} /></main>
    </>
  );
}
