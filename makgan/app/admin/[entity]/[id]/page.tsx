import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import EntityForm from "@/components/admin/EntityForm";
import CastForm from "@/components/admin/CastForm";
import DeleteButton from "@/components/admin/DeleteButton";
import { requireAdmin } from "@/lib/admin";
import { ADMIN_ENTITIES, isEntityKey, isoToKstLocal } from "@/lib/admin-entities";
import { adminAddCast, adminDeleteCast, adminSave } from "@/lib/actions/admin";
import { adminCasts, adminGet, adminOptionSets } from "@/lib/data/admin";
import { isUuid } from "@/lib/data/shows";
import { formatDay } from "@/lib/date";

export default async function AdminEditPage({ params }: { params: Promise<{ entity: string; id: string }> }) {
  await requireAdmin();
  const { entity: key, id } = await params;
  if (!isEntityKey(key)) notFound();
  const entity = ADMIN_ENTITIES[key];
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();

  const [row, options] = await Promise.all([isNew ? null : adminGet(entity, id), adminOptionSets()]);
  if (!isNew && !row) notFound();

  const initial: Record<string, string> = {};
  if (row) {
    initial.id = String(row.id);
    for (const f of entity.fields) {
      const v = row[f.name];
      initial[f.name] = v == null ? "" : f.type === "datetime" ? isoToKstLocal(String(v)) : String(v);
    }
  }
  const casts = key === "shows" && row ? await adminCasts(id) : [];

  return (
    <>
      <PageHeader title={isNew ? `${entity.label} 추가` : `${entity.label} 수정`} back={`/admin/${key}`} action={<span />} />
      <main className="page-body">
        <EntityForm
          action={adminSave.bind(null, key)}
          fields={entity.fields}
          initial={initial}
          optionSets={{ theaters: options.theaters, shows: options.shows }}
          submitLabel={isNew ? "추가" : "저장"}
        />

        {key === "shows" && row && (
          <section className="section" aria-labelledby="cast-admin">
            <h3 className="section-title" id="cast-admin">캐스팅</h3>
            {casts.length === 0 ? <p className="muted">등록된 캐스팅이 없어요</p> : (
              <ul className="admin-list">
                {casts.map((c) => (
                  <li key={c.id} className="admin-row">
                    <span className="admin-row-main">
                      <strong>{c.actor.name} · {c.role_name}</strong>
                      <span className="muted">{c.perf_date ? formatDay(c.perf_date) : "시즌 캐스팅"}</span>
                    </span>
                    <DeleteButton action={adminDeleteCast.bind(null, c.id)} confirmText="이 캐스팅을 삭제할까요?" />
                  </li>
                ))}
              </ul>
            )}
            <CastForm action={adminAddCast.bind(null, id)} actors={options.actors} minDate={String(row.starts_on)} maxDate={String(row.ends_on)} />
          </section>
        )}
      </main>
    </>
  );
}
