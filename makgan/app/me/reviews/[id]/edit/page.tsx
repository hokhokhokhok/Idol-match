import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ReviewForm from "@/components/ReviewForm";
import { requireProfile } from "@/lib/auth";
import { updateReview } from "@/lib/actions/reviews";
import { getMyReview, listShowOptions } from "@/lib/data/reviews";
import { kstDateString } from "@/lib/date";

export const metadata = { title: "후기 수정 · 막간" };

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile(`/me/reviews/${id}/edit`);
  const [review, shows] = await Promise.all([getMyReview(id), listShowOptions()]);
  if (!review) notFound();   // 남의 후기도 여기로(존재 여부를 알려 주지 않음)

  return (
    <>
      <PageHeader title="후기 수정" back="/me" action={<span />} />
      <main className="page-body">
        <ReviewForm
          action={updateReview}
          shows={shows}
          today={kstDateString()}
          submitLabel="수정 저장"
          initial={{
            id: review.id, show_id: review.show_id, watched_at: review.watched_at, rating: String(review.rating),
            body: review.body ?? "", cast_note: review.cast_note ?? "", seat_text: review.seat_text ?? "",
            price: review.price == null ? "" : String(review.price), is_public: String(review.is_public),
          }}
        />
      </main>
    </>
  );
}
