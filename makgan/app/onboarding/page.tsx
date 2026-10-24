import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getProfile, safeNext } from "@/lib/auth";
import NicknameForm from "./NicknameForm";

export const metadata = { title: "닉네임 · 막간" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (profile.nickname) redirect(next);

  return (
    <>
      <PageHeader title="반가워요!" action={<span />} />
      <main className="page-body">
        <p className="lead">막간에서 쓸 닉네임을 정해 주세요.</p>
        <NicknameForm next={next} />
      </main>
    </>
  );
}
