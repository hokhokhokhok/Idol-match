import Link from "next/link";

/** 네트워크 오류(SPEC-2 A-2): "불러오지 못했어요" + 다시 시도 */
export default function ErrorState({ retryHref }: { retryHref: string }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon" aria-hidden="true">⚠️</div>
      <p>불러오지 못했어요</p>
      <Link href={retryHref} className="btn btn-primary" prefetch={false}>다시 시도</Link>
    </div>
  );
}
