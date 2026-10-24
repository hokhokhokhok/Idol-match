import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export const metadata = { title: "혜택 · 막간" };

export default function BenefitsPage() {
  return (
    <>
      <PageHeader title="혜택" />
      <main className="page-body">
        <Placeholder icon="🎁" title="혜택 목록" step={5} />
      </main>
    </>
  );
}
