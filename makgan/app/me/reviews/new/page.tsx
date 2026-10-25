import PageHeader from "@/components/PageHeader";
import ReviewForm from "@/components/ReviewForm";
import { requireProfile } from "@/lib/auth";
import { createReview } from "@/lib/actions/reviews";
import { listShowOptions } from "@/lib/data/reviews";
import { isUuid } from "@/lib/data/shows";
import { kstDateString } from "@/lib/date";

export const metadata = { title: "후기 쓰기 · 막간" };

export default async function NewReviewPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
  await requireProfile(`/me/reviews/new${isUuid(show) ? `?show=${show}` : ""}`);
  const shows = await listShowOptions();
  return (
    <>
      <PageHeader title="후기 쓰기" back={isUuid(show) ? `/shows/${show}` : "/me"} action={<span />} />
      <main className="page-body">
        <ReviewForm action={createReview} shows={shows} initial={{ show_id: isUuid(show) ? show : undefined }} today={kstDateString()} submitLabel="저장" />
      </main>
    </>
  );
}
