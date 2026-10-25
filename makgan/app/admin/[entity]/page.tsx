import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import DeleteButton from "@/components/admin/DeleteButton";
import { requireAdmin } from "@/lib/admin";
import { ADMIN_ENTITIES, isEntityKey } from "@/lib/admin-entities";
import { adminDelete } from "@/lib/actions/admin";
import { ADMIN_PAGE, adminList } from "@/lib/data/admin";
import { formatDeadline, formatPeriod } from "@/lib/date";

export default async function AdminListPage({ params, searchParams }: { params: Promise<{ entity: string }>; searchParams: Promise<{ q?: string; limit?: string }> }) {
  await requireAdmin();
  const { entity: key } = await params;
  if (!isEntityKey(key)) notFound();
  const entity = ADMIN_ENTITIES[key];
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 50);
  const limit = Math.min(Math.max(Number(sp.limit) || ADMIN_PAGE, ADMIN_PAGE), 2000);
  const { rows, hasMore } = await adminList(entity, { q, limit });
  const more = `/admin/${key}?${new URLSearchParams({ ...(q ? { q } : {}), limit: String(limit + ADMIN_PAGE) })}`;

  const sub = (r: Record<string, unknown>) => {
    if (key === "shows") return formatPeriod(String(r.starts_on), String(r.ends_on));
    if (key === "benefits") return r.ends_at ? formatDeadline(String(r.ends_at)) : "마감 없음";
    if (key === "theaters") return (r.address as string) ?? "";
    if (key === "videos") return `youtu.be/${r.youtube_id}`;
    if (key === "glossary") return `${r.status === "published" ? "공개" : "초안"}${r.category ? ` · ${r.category}` : ""}`;
    return "";
  };

  return (
    <>
      <PageHeader title={`${entity.label} 관리`} back="/admin" action={<Link href={`/admin/${key}/new`} className="btn btn-small btn-primary">+ 새로</Link>} />
      <main className="page-body">
        <form role="search" className="search-form admin-search" action={`/admin/${key}`}>
          <input type="search" name="q" defaultValue={q} maxLength={50} placeholder={`${entity.label} 이름 검색`} aria-label={`${entity.label} 검색`} />
          <button className="btn">찾기</button>
        </form>
        {rows.length === 0 ? (
          q ? <p className="muted">'{q}'에 맞는 {entity.label}이(가) 없어요</p> : <EmptyState icon="🗂️" message={`등록된 ${entity.label}이(가) 없어요`} action={{ label: "새로 만들기", href: `/admin/${key}/new` }} />
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
        {hasMore && <Link href={more} className="btn btn-block more-btn" scroll={false}>더 보기</Link>}
      </main>
    </>
  );
}
