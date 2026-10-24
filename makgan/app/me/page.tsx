import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";
import LoginRequired from "@/components/LoginRequired";
import { getProfile } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";

export const metadata = { title: "MY · 막간" };

export default async function MePage() {
  const profile = await getProfile();
  if (profile && !profile.nickname) redirect("/onboarding?next=/me");

  return (
    <>
      <PageHeader title="MY" />
      <main className="page-body">
        {!profile ? (
          <LoginRequired next="/me" />
        ) : (
          <>
            <section className="profile-row">
              <strong data-testid="nickname">{profile.nickname}</strong>
              {profile.is_admin && <span className="badge">관리자</span>}
              <form action={signOut}><button className="btn btn-text">로그아웃</button></form>
            </section>
            <Placeholder icon="📒" title="내 관극 기록" step={8} />
          </>
        )}
      </main>
    </>
  );
}
