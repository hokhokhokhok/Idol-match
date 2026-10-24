import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export const metadata = { title: "MY · 막간" };

export default function MePage() {
  return (
    <>
      <PageHeader title="MY" />
      <main className="page-body">
        <Placeholder icon="📒" title="내 관극 기록" step={8} />
      </main>
    </>
  );
}
