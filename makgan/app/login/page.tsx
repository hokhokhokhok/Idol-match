import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getUser, safeNext } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata = { title: "로그인 · 막간" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);
  if (await getUser()) redirect(next);

  return (
    <>
      <PageHeader title="로그인" action={<span />} />
      <main className="page-body">
        {error === "link" && <p className="notice">로그인 링크가 만료됐거나 이미 사용됐어요. 다시 받아 주세요. 메일의 링크는 로그인 링크를 요청한 브라우저에서 열어 주세요.</p>}
        <LoginForm next={next} />
      </main>
    </>
  );
}
