import EmptyState from "./EmptyState";

export default function LoginRequired({ next }: { next: string }) {
  return <EmptyState icon="🔒" message="로그인하면 기록을 저장할 수 있어요" action={{ label: "로그인", href: `/login?next=${encodeURIComponent(next)}` }} />;
}
