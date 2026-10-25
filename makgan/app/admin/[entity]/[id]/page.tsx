import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import EntityForm from "@/components/admin/EntityForm";
import CastForm from "@/components/admin/CastForm";
import ZoneForm from "@/components/admin/ZoneForm";
import LinkAutofill from "@/components/admin/LinkAutofill";
import DeleteButton from "@/components/admin/DeleteButton";
import { requireAdmin } from "@/lib/admin";
import { ADMIN_ENTITIES, isEntityKey, isoToKstLocal } from "@/lib/admin-entities";
import { adminAddCast, adminAddZone, adminDeleteCast, adminDeleteZone, adminSave } from "@/lib/actions/admin";
import { adminCasts, adminGet, adminOptionSets, adminZones } from "@/lib/data/admin";
import { isUuid } from "@/lib/data/shows";
import { formatDay } from "@/lib/date";
import { youTubeWatch } from "@/lib/youtube";

export default async function AdminEditPage({ params, searchParams }: { params: Promise<{ entity: string; id: string }>; searchParams: Promise<{ show?: string; type?: string }> }) {
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
      initial[f.name] = v == null ? "" : f.type === "datetime" ? isoToKstLocal(String(v)) : f.type === "youtube" ? youTubeWatch(String(v)) : String(v);
    }
  }
  // 새 혜택/영상을 공연 화면에서 넘어와 만들 때: 공연과 종류를 미리 채운다(?show=…&type=lottery)
  if (isNew && (key === "benefits" || key === "videos")) {
    const sp = await searchParams;
    if (isUuid(sp.show) && options.shows.some((o) => o.value === sp.show)) initial.show_id = sp.show!;
    if (key === "benefits" && ["lottery", "discount", "ticket_open", "event"].includes(sp.type ?? "")) initial.type = sp.type!;
  }
  const casts = key === "shows" && row ? await adminCasts(id) : [];
  const zones = key === "theaters" && row ? await adminZones(id) : [];

  return (
    <>
      <PageHeader title={isNew ? `${entity.label} 추가` : `${entity.label} 수정`} back={`/admin/${key}`} action={<span />} />
      <main className="page-body">
        {key === "benefits" && <LinkAutofill formId="entity-form" />}
        <EntityForm
          formId="entity-form"
          action={adminSave.bind(null, key)}
          fields={entity.fields}
          initial={initial}
          optionSets={{ theaters: options.theaters, shows: options.shows, actors: options.actors }}
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
        {key === "theaters" && row && (
          <section className="section" aria-labelledby="zone-admin">
            <h3 className="section-title" id="zone-admin">층 · 구역</h3>
            <p className="form-hint">공식 좌석 배치도를 확인한 구역만 입력해 주세요. 구역이 없으면 사용자는 층과 구역 이름을 직접 적어요.</p>
            {zones.length === 0 ? <p className="muted">등록된 구역이 없어요</p> : (
              <ul className="admin-list">
                {zones.map((z) => (
                  <li key={z.id} className="admin-row">
                    <span className="admin-row-main"><strong>{z.floor} · {z.name}</strong><span className="muted">정렬 {z.sort_order}</span></span>
                    <DeleteButton action={adminDeleteZone.bind(null, z.id)} confirmText={`'${z.floor} ${z.name}' 구역을 삭제할까요? 이 구역의 좌석 후기는 구역 없이 남아요.`} />
                  </li>
                ))}
              </ul>
            )}
            <ZoneForm action={adminAddZone.bind(null, id)} />
          </section>
        )}
      </main>
    </>
  );
}
