import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { requireAdmin } from "@/lib/admin";
import { ADMIN_ENTITIES } from "@/lib/admin-entities";

export const metadata = { title: "관리자 · 막간" };

export default async function AdminPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="관리자" back="/me" action={<span />} />
      <main className="page-body">
        <p className="lead">실제 공연·배우 정보는 공식 출처를 확인한 뒤 입력해 주세요. 예시 데이터에는 [샘플]을 붙여 주세요.</p>
        <ul className="admin-menu">
          {Object.values(ADMIN_ENTITIES).map((e) => (
            <li key={e.key}><Link href={`/admin/${e.key}`} className="admin-menu-item">{e.label} 관리 <span aria-hidden="true">›</span></Link></li>
          ))}
        </ul>
      </main>
    </>
  );
}
