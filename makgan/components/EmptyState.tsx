import Link from "next/link";

/** 빈 화면: 아이콘 + 문구 + 버튼 1개(SPEC-2 A-1, A-2) */
export default function EmptyState({ icon, message, action }: { icon: string; message: string; action?: { label: string; href: string } }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <p>{message}</p>
      {action && <Link href={action.href} className="btn btn-primary">{action.label}</Link>}
    </div>
  );
}
