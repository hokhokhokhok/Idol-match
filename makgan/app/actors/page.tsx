import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export const metadata = { title: "배우 · 막간" };

export default function ActorsPage() {
  return (
    <>
      <PageHeader title="배우" />
      <main className="page-body">
        <Placeholder icon="🌟" title="배우 목록" step={4} />
      </main>
    </>
  );
}
