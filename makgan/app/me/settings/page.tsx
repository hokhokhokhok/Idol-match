import PageHeader from "@/components/PageHeader";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import SettingsForm from "./SettingsForm";
import DevicePush from "./DevicePush";

export const metadata = { title: "알림 설정 · 막간" };

const DEFAULTS = { benefit_deadline: true, ticket_open: true, cast_added: true, wishlist_ending: true, quiet_start: "23:00", quiet_end: "08:00" };

export default async function SettingsPage() {
  const profile = await requireProfile("/me/settings");
  const supabase = await createClient();
  const { data } = await supabase.from("notification_settings").select("*").eq("user_id", profile.id).maybeSingle();
  return (
    <>
      <PageHeader title="알림 설정" back="/me" action={<span />} />
      <main className="page-body">
        <SettingsForm initial={{ ...DEFAULTS, ...(data ?? {}) }} />
        <DevicePush />
      </main>
    </>
  );
}
