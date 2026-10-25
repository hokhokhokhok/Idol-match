"use client";
import { useActionState, useEffect } from "react";
import { saveNotificationSettings, type SettingsState } from "@/lib/actions/push";
import { toast } from "@/components/Toast";

type S = { benefit_deadline: boolean; ticket_open: boolean; cast_added: boolean; wishlist_ending: boolean; quiet_start: string; quiet_end: string };
const KINDS = [
  { name: "benefit_deadline", label: "로터리·할인 마감 1시간 전" },
  { name: "ticket_open", label: "티켓오픈 10분 전" },
  { name: "cast_added", label: "팔로우한 배우 캐스팅 추가" },
  { name: "wishlist_ending", label: "찜한 공연 종료 7일 전" },
] as const;

export default function SettingsForm({ initial }: { initial: S }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveNotificationSettings, {});
  useEffect(() => { if (state.ok) toast("저장했어요"); }, [state]);
  return (
    <form action={action} className="form">
      <fieldset className="settings-group">
        <legend>알림 종류</legend>
        {KINDS.map((k) => (
          <label key={k.name} className="check switch-row">
            <span>{k.label}</span>
            <input type="checkbox" name={k.name} defaultChecked={initial[k.name]} />
          </label>
        ))}
      </fieldset>
      <fieldset className="settings-group">
        <legend>방해금지 시간</legend>
        <div className="field-row">
          <label className="field"><span>시작</span><input type="time" name="quiet_start" defaultValue={initial.quiet_start.slice(0, 5)} required /></label>
          <label className="field"><span>끝</span><input type="time" name="quiet_end" defaultValue={initial.quiet_end.slice(0, 5)} required /></label>
        </div>
        <small className="form-hint">이 시간에 생긴 알림은 끝나는 시각에 묶어서 보내드려요. 시작과 끝을 같게 하면 꺼져요.</small>
      </fieldset>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>{pending ? "저장 중…" : "설정 저장"}</button>
    </form>
  );
}
