import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export const metadata = { title: "공연 · 막간" };

export default function ShowsPage() {
  return (
    <>
      <PageHeader title="공연" />
      <main className="page-body">
        <Placeholder icon="🎟️" title="공연 목록" step={3} />
      </main>
    </>
  );
}
