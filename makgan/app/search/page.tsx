import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export const metadata = { title: "검색 · 막간" };

export default function SearchPage() {
  return (
    <>
      <PageHeader title="검색" action={<span />} />
      <main className="page-body">
        <Placeholder icon="🔍" title="공연·배우·극장 검색" step={9} />
      </main>
    </>
  );
}
