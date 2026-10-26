import type { Metadata } from "next";
import { CORRECTION_URL, REVERIFY_MONTHS, correctionLink } from "@/lib/constants";

export const metadata: Metadata = { title: "데이터 안내 · 마곡 뮤지컬 학원 찾기" };

export default function AboutPage() {
  return (
    <main className="px-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">데이터 안내</h1>
      </header>

      <div className="mt-4 space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="mb-1 text-base font-bold">무엇을 싣나요</h2>
          <p>
            서울 강서구 마곡동·화곡동·발산동(내발산·외발산)·가양동·등촌동·방화동에서 초·중등 대상 수업이 있는 보컬(키즈보컬)·댄스·발레·탭댄스·아크로바틱·체조·연기·뮤지컬 종합 학원과, 서울 전역의 초·중등 대상 보컬·댄스·연기·뮤지컬 종합 학원, 그 원장·강사의 학원 운영·뮤지컬 활동·강의
            경력을 모읍니다. 성인·입시 전문 학원은 싣지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">수집 기준</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>교육청 공공데이터(오늘학교 아카데미), 학원 정보 플랫폼(런즈), 학원 홈페이지·공식 SNS처럼 <strong>공개된 정보만</strong> 사람이 직접 확인해 입력합니다. 자동 수집(크롤링)은 하지 않습니다.</li>
            <li>강사 경력은 <strong>본인 또는 학원이 직접 공개한 것만</strong> 싣고, 공개 근거를 함께 적습니다.</li>
            <li>모든 경력 항목에 <strong>출처 링크와 수집일</strong>을 표시합니다.</li>
            <li>확인하지 못한 항목은 비워 두거나 &lsquo;미확인&rsquo;으로 표시하며, 추측해서 채우지 않습니다.</li>
            <li>수강료는 공시 금액과 학원 안내가 다르면 둘 다 적습니다. 정확한 금액과 추가 비용은 학원에 문의해 주세요.</li>
            <li>마지막 확인일이 {REVERIFY_MONTHS}개월을 넘으면 &lsquo;재확인 필요&rsquo;로 표시합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">표시 읽는 법</h2>
          <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-2">
            <dt><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-ok">확인됨</span></dt>
            <dd>교육청 공공데이터로 학원 등록·주소·과목을 확인함</dd>
            <dt><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-warn">미확인</span></dt>
            <dd>학원 정보 플랫폼·학원 소개로만 확인했거나 출처끼리 내용이 다름. 대상 학년이 플랫폼의 &lsquo;수업대상&rsquo; 표기에만 근거한 곳도 있음</dd>
            <dt><span className="rounded bg-emerald-50 px-1.5 text-xs text-ok">공연 DB 확인</span></dt>
            <dd>뮤지컬 출연·스태프 경력을 KOPIS 등 공연 DB에서 작품·연도까지 교차 확인함</dd>
            <dt><span className="rounded bg-amber-50 px-1.5 text-xs text-warn">미확인</span> (경력)</dt>
            <dd>본인·학원이 공개했지만 공연 DB로는 아직 확인 전</dd>
          </dl>
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">정정·삭제 요청</h2>
          <p>
            학원 관계자 또는 본인이 정보 정정이나 삭제를 원하시면 아래로 알려 주세요. 각 학원 상세 화면 맨 아래의 &lsquo;정보 정정·삭제 요청&rsquo;을
            누르면 학원 이름이 미리 채워집니다. 확인 후 반영하거나 삭제합니다.
          </p>
          <a
            href={correctionLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-full bg-ink px-4 py-2 font-medium text-white"
          >
            정정·삭제 요청하기
          </a>
          {CORRECTION_URL.includes("github.com") && (
            <p className="mt-2 text-xs text-sub">GitHub 이슈로 접수됩니다 (GitHub 계정 필요).</p>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-base font-bold">즐겨찾기·비교</h2>
          <p>즐겨찾기와 비교 목록은 이 기기의 브라우저에만 저장되며 서버로 보내지 않습니다.</p>
        </section>
      </div>
    </main>
  );
}
