import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/admin/DeleteButton";
import { requireAdmin } from "@/lib/admin";
import { ADMIN_ENTITIES, isEntityKey } from "@/lib/admin-entities";
import { adminDelete } from "@/lib/actions/admin";
import { adminList } from "@/lib/data/admin";
import { formatDeadline, formatPeriod } from "@/lib/date";

export default async function AdminListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { entity: key } = await params;
  if (!isEntityKey(key)) notFound();
  const entity = ADMIN_ENTITIES[key];
  const rows = await adminList(entity);
  const { saved } = await searchParams;

  const sub = (r: Record<string, unknown>) => {
    if (key === "shows") return formatPeriod(String(r.starts_on), String(r.ends_on));
    if (key === "benefits") return r.ends_at ? formatDeadline(String(r.ends_at)) : "마감 없음";
    if (key === "theaters") return (r.address as string) ?? "";
    return "";
  };

  return (
    <>
      <PageHeader title={`${entity.label} 관리`} back="/admin" action={<Link href={`/admin/${key}/new`} className="btn btn-small btn-primary">+ 새로</Link>} />
      <main className="page-body">
        {saved && <p className="notice" role="status">저장했어요</p>}
        {rows.length === 0 ? (
          <EmptyState icon="🗂️" message={`등록된 ${entity.label}이(가) 없어요`} action={{ label: "새로 만들기", href: `/admin/${key}/new` }} />
        ) : (
          <ul className="admin-list">
            {rows.map((r) => {
              const title = String(r[entity.titleField]);
              return (
                <li key={String(r.id)} className="admin-row">
                  <Link href={`/admin/${key}/${r.id}`} className="admin-row-main">
                    <strong>{title}</strong>
                    {sub(r) && <span className="muted">{sub(r)}</span>}
                  </Link>
                  <DeleteButton action={adminDelete.bind(null, key, String(r.id))} confirmText={`'${title}'을(를) 삭제할까요? 연결된 정보도 함께 지워질 수 있어요.`} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
